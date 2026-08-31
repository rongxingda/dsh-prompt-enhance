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

const baseOptions = {
  route: { provider: 'zhipu', model: 'glm-5.3' } satisfies RoutePair,
  system: 'SYS',
  text: '帮我写个爬虫',
  temperature: 0.3,
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
