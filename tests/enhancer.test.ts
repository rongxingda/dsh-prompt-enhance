import { describe, expect, it } from 'vitest'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { enhanceText, formatEnhanceError, resolveRoute, toEnhanceError, type LlmStreamFace, type RoutePair } from '../src/enhancer'

/** Terminal-finish flavor the helper should emit. */
interface FinishFlavor {
  reason: 'stop' | 'error' | 'max-tokens'
  code?: string
  message?: string
}

/** Build a text stream: one text block from parts, then usage, then finish. */
function textStream(parts: string[], flavor: FinishFlavor): AsyncIterable<StreamChunk> {
  const chunks: StreamChunk[] = [
    { type: 'block-start', index: 0, blockType: 'text' },
    ...parts.map((text): StreamChunk => ({ type: 'text-delta', index: 0, text })),
    { type: 'block-end', index: 0, block: { type: 'text', text: parts.join('') } },
    { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } },
  ]
  if (flavor.reason === 'stop') chunks.push({ type: 'finish', reason: { kind: 'stop' } })
  else if (flavor.reason === 'max-tokens') chunks.push({ type: 'finish', reason: { kind: 'max-tokens' } })
  else chunks.push({ type: 'finish', reason: { kind: 'error', failure: { message: flavor.message ?? 'boom', code: flavor.code ?? 'INTERNAL' } } })
  return (async function* (): AsyncGenerator<StreamChunk> {
    for (const chunk of chunks) yield chunk
  })()
}

/** Stub llm face recording the options and replaying the given stream. */
function stubLlm(stream: (options: GenerateOptions) => AsyncIterable<StreamChunk>): LlmStreamFace & { calls: GenerateOptions[] } {
  const calls: GenerateOptions[] = []
  return {
    calls,
    stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
      calls.push(options)
      return stream(options)
    },
  }
}

/**
 * Mimic how a real host reports the harness refusing an explicit reasoning
 * effort for a model whose capability declares no reasoning at all.
 *
 * Shape copied from the harness source, not invented: an adapter throw is turned
 * into a terminal `error` finish CHUNK rather than propagating
 * (`dsh-llm/lib/types/index.js`: "Adapter selection, dispatch, and iteration
 * failures become terminal `error` or `aborted` finish chunks"), and
 * `normalizeLlmFailure` keeps the code verbatim because `harnessErrorCode` reads
 * `error.code` off any `HarnessError` and `LlmError` is one. So the stable string
 * `UNSUPPORTED_REASONING_EFFORT` arrives as `failure.code`, and the message is the
 * localized prose the retry must NOT be matching on.
 * @param effort - the effort the call asked for.
 * @returns the terminal finish chunk a live host emits for that call.
 */
function noReasoningSupport(effort: string): StreamChunk {
  return {
    type: 'finish',
    reason: {
      kind: 'error',
      failure: {
        message: `provider "agnes" model "agnes-2.5-flash" does not support reasoning effort "${effort}"`,
        code: 'UNSUPPORTED_REASONING_EFFORT',
      },
    },
  }
}

/** A stream whose only content is the harness's unsupported-effort refusal. */
function refusalStream(effort: string): AsyncIterable<StreamChunk> {
  const chunk = noReasoningSupport(effort)
  return (async function* (): AsyncGenerator<StreamChunk> {
    yield chunk
  })()
}

const baseOptions = {
  route: { provider: 'zhipu', model: 'glm-5.3' } satisfies RoutePair,
  system: 'SYS',
  text: '帮我写个爬虫',
  temperature: 0.3,
  reasoningEffort: 'off' as const,
  maxTokens: 512,
  timeoutMs: 5000,
}

describe('enhanceText', () => {
  it('assembles, normalizes, and reports the route', async () => {
    const llm = stubLlm(() => textStream(['角色：Python', ' 工程师…'], { reason: 'stop' }))
    const result = await enhanceText(llm, baseOptions)
    expect(result.text).toBe('角色：Python 工程师…')
    expect(result.provider).toBe('zhipu')
    expect(result.model).toBe('glm-5.3')
    expect(llm.calls[0]?.system).toBe('SYS')
    expect(llm.calls[0]?.temperature).toBe(0.3)
    expect(llm.calls[0]?.messages[0]?.content[0]).toMatchObject({ type: 'text' })
  })

  // Cost regression: omitting the field makes the adapter apply the model's own
  // default effort, which measured ~11x the output tokens of `off` on
  // deepseek-flash for the same draft. The effort must reach the call.
  it('forwards the configured reasoning effort to the model call', async () => {
    const llm = stubLlm(() => textStream(['ok'], { reason: 'stop' }))
    await enhanceText(llm, { ...baseOptions, reasoningEffort: 'low' })
    expect(llm.calls[0]?.reasoningEffort).toBe('low')
  })

  it('omits the reasoning effort entirely when set to inherit', async () => {
    const llm = stubLlm(() => textStream(['ok'], { reason: 'stop' }))
    await enhanceText(llm, { ...baseOptions, reasoningEffort: 'inherit' })
    expect(llm.calls[0]).not.toHaveProperty('reasoningEffort')
  })

  // The harness rejects an explicit effort outright when the model declares no
  // reasoning capability, before any provider I/O, with this exact code. The
  // cheap `off` default must therefore degrade to "no field" for those models
  // instead of failing every call.
  //
  // This test asserts on the finish-chunk shape on purpose. An earlier version
  // of it stubbed the refusal as a THROW and passed while the real host kept
  // failing: the harness converts an adapter failure into a terminal finish
  // chunk, so nothing was ever thrown for the retry to catch. The stub had the
  // wrong shape, not the assertion.
  it('retries once without the effort when the model has no reasoning capability', async () => {
    const llm = stubLlm((options) => {
      if (options.reasoningEffort !== undefined) return refusalStream(options.reasoningEffort)
      return textStream(['ok'], { reason: 'stop' })
    })
    const result = await enhanceText(llm, baseOptions)
    expect(result.text).toBe('ok')
    expect(llm.calls).toHaveLength(2)
    // The rejected attempt is not silently dropped: it is identifiable in the
    // recorded traffic as the one that carried the effort.
    expect(llm.calls[0]?.reasoningEffort).toBe('off')
    expect(llm.calls[1]).not.toHaveProperty('reasoningEffort')
  })

  it('surfaces the refusal without retrying when the effort was already inherit', async () => {
    let calls = 0
    const llm = stubLlm(() => {
      calls += 1
      return refusalStream('off')
    })
    await expect(enhanceText(llm, { ...baseOptions, reasoningEffort: 'inherit' })).rejects.toMatchObject({ detail: { code: 'upstream' } })
    // No effort was sent, so the refusal cannot belong to this call: retrying
    // would send the identical request and fail the same way.
    expect(calls).toBe(1)
  })

  it('surfaces the error when the deferred retry fails too', async () => {
    let calls = 0
    const llm = stubLlm(() => {
      calls += 1
      return refusalStream('off')
    })
    await expect(enhanceText(llm, baseOptions)).rejects.toMatchObject({ detail: { code: 'upstream' } })
    // Exactly one deferral: the retry is not itself retried.
    expect(calls).toBe(2)
  })

  // Defence in depth for a host that rejects the effort outside the harness's
  // terminal conversion. Nothing ships that relies on this `catch` — a live host
  // takes the finish-chunk path above — but the retry must not regress silently
  // if one ever throws, so both shapes are pinned to the same observable
  // behaviour: one retry, and the second request carries no effort.
  it('retries the same way when the refusal arrives as a thrown error', async () => {
    const llm = stubLlm((options) => {
      if (options.reasoningEffort !== undefined) {
        return (async function* (): AsyncGenerator<StreamChunk> {
          throw Object.assign(new Error(`provider "agnes" model "agnes-2.5-flash" does not support reasoning effort "${options.reasoningEffort}"`), { code: 'UNSUPPORTED_REASONING_EFFORT' })
        })()
      }
      return textStream(['ok'], { reason: 'stop' })
    })
    const result = await enhanceText(llm, baseOptions)
    expect(result.text).toBe('ok')
    expect(llm.calls).toHaveLength(2)
    expect(llm.calls[1]).not.toHaveProperty('reasoningEffort')
  })

  it('strips a wrapping fence from the model output', async () => {
    const llm = stubLlm(() => textStream(['```\n角色：翻译\n```'], { reason: 'stop' }))
    const result = await enhanceText(llm, baseOptions)
    expect(result.text).toBe('角色：翻译')
  })

  it('maps an AUTH error finish to a fix hint and keeps the draft untouched', async () => {
    const llm = stubLlm(() => textStream([], { reason: 'error', code: 'AUTH', message: '401' }))
    await expect(enhanceText(llm, baseOptions)).rejects.toMatchObject({
      detail: { code: 'upstream', params: { reason: 'auth' }, message: '401' },
    })
  })

  it('maps NO_ADAPTER to the unconfigured code', async () => {
    const llm = stubLlm(() => textStream([], { reason: 'error', code: 'NO_ADAPTER', message: 'no route' }))
    await expect(enhanceText(llm, baseOptions)).rejects.toMatchObject({ detail: { code: 'unconfigured' } })
  })

  it('rejects a max-tokens finish', async () => {
    const llm = stubLlm(() => textStream(['部分'], { reason: 'max-tokens' }))
    await expect(enhanceText(llm, baseOptions)).rejects.toMatchObject({
      detail: { code: 'upstream', params: { reason: 'max-tokens' } },
    })
  })

  it('rejects an empty output', async () => {
    const llm = stubLlm(() => textStream(['  '], { reason: 'stop' }))
    await expect(enhanceText(llm, baseOptions)).rejects.toMatchObject({
      detail: { code: 'upstream', params: { reason: 'empty' } },
    })
  })

  it('times out a stalled stream', async () => {
    const stall = (): AsyncIterable<StreamChunk> => ({
      [Symbol.asyncIterator]: () => ({ next: (): Promise<never> => new Promise(() => {}) }),
    })
    const llm = stubLlm(() => stall())
    await expect(enhanceText(llm, { ...baseOptions, timeoutMs: 40 })).rejects.toMatchObject({
      detail: { code: 'timeout', params: { seconds: 1 } },
    })
  })

  it('honors a pre-aborted caller signal as a cancel', async () => {
    const llm = stubLlm(() => textStream(['文本'], { reason: 'stop' }))
    const controller = new AbortController()
    controller.abort()
    await expect(enhanceText(llm, { ...baseOptions, signal: controller.signal })).rejects.toMatchObject({
      detail: { code: 'internal' },
    })
  })
})

describe('resolveRoute', () => {
  const session: RoutePair = { provider: 'session-p', model: 'session-m' }
  const fallback: RoutePair = { provider: 'default-p', model: 'default-m' }

  it('prefers the explicit settings pair', () => {
    expect(resolveRoute({ provider: 'zhipu', model: 'glm-5.3' }, session, fallback)).toEqual({ provider: 'zhipu', model: 'glm-5.3' })
  })

  it('falls back to the session route, then the harness default', () => {
    expect(resolveRoute(undefined, session, fallback)).toBe(session)
    expect(resolveRoute(undefined, undefined, fallback)).toBe(fallback)
    expect(resolveRoute({ provider: 'zhipu' }, session, fallback)).toBe(session)
  })

  it('yields undefined when nothing names a route', () => {
    expect(resolveRoute(undefined, undefined, undefined)).toBeUndefined()
  })
})

describe('toEnhanceError', () => {
  it('wraps foreign errors as internal', () => {
    const wire = toEnhanceError(new Error('unexpected'))
    expect(wire.code).toBe('internal')
    expect(wire.message).toContain('unexpected')
  })

  it('passes through structured details', async () => {
    try {
      await enhanceText(stubLlm(() => textStream([], { reason: 'error', code: 'RATE_LIMIT', message: '429' })), baseOptions)
      expect.unreachable()
    } catch (error) {
      expect(toEnhanceError(error).code).toBe('upstream')
      expect(toEnhanceError(error).params).toEqual({ reason: 'rate-limit' })
    }
  })
})

describe('formatEnhanceError', () => {
  it('renders structured errors into displayable Chinese text', () => {
    expect(formatEnhanceError({ code: 'rate-limit', params: { limit: 10, retryAfterSeconds: 7 } })).toContain('7 秒')
    expect(formatEnhanceError({ code: 'concurrency-limit', params: { max: 2 } })).toContain('2')
    expect(formatEnhanceError({ code: 'timeout', params: { seconds: 60 } })).toContain('60 秒')
    expect(formatEnhanceError({ code: 'unconfigured' })).toContain('provider/model')
  })

  it('picks a specific hint for known upstream reasons and appends the raw detail', () => {
    expect(formatEnhanceError({ code: 'upstream', params: { reason: 'auth' } })).toContain('API Key')
    expect(formatEnhanceError({ code: 'upstream', params: { reason: 'quota' } })).toContain('配额')
    // Unknown reason falls back to the generic upstream line.
    expect(formatEnhanceError({ code: 'upstream' })).toContain('模型服务返回错误')
    // The provider's raw message rides along as the detail line.
    const withDetail = formatEnhanceError({ code: 'upstream', params: { reason: 'auth' }, message: '401 unauthorized' })
    expect(withDetail).toContain('401 unauthorized')
  })

  it('keeps a rejected error short without a detail', () => {
    expect(formatEnhanceError({ code: 'rejected' })).toBe('增强请求被拒绝。')
  })
})
