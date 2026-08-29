/**
 * One auxiliary enhancement call through the harness LLM service. Mirrors
 * the dsh-session-title-llm contract: paired route resolution, framed user
 * prompt, composed deadline + caller cancellation rechecked during and
 * after the stream, terminal-finish validation, output normalization.
 * @module dsh-prompt-enhance/enhancer
 */

import { BlockAssembler, createUserMessage } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, FinishReason, StreamChunk } from '@deepseek-ai/dsh-llm'
import type { EnhanceError, EnhanceResult } from './shared/protocol'
import { normalizeOutput } from './shared/normalize'
import { frameUserPrompt } from './prompts'

/** Structural LLM face so tests stub the stream without a Cordis runtime. */
export interface LlmStreamFace {
  stream(options: GenerateOptions): AsyncIterable<StreamChunk>
}

/** One resolved provider/model route. */
export interface RoutePair {
  provider: string
  model: string
}

/** Internal failure carrying the wire error verbatim. */
class EnhanceFailure extends Error {
  constructor(public readonly detail: EnhanceError) {
    super(detail.message)
  }
}

/**
 * Resolve the call route by precedence: the explicit settings pair, then the
 * session's logged request route, then the harness default-model selection.
 * @param explicit - the plugin settings provider/model pair (both or neither).
 * @param session - the session's current request-header route, when known.
 * @param fallback - the `agent-default-model` selection, when registered.
 * @returns the route, or undefined when no source names one.
 */
export function resolveRoute(explicit: Partial<RoutePair> | undefined, session: RoutePair | undefined, fallback: RoutePair | undefined): RoutePair | undefined {
  if (explicit?.provider !== undefined && explicit.provider !== '' && explicit.model !== undefined && explicit.model !== '') {
    return { provider: explicit.provider, model: explicit.model }
  }
  return session ?? fallback
}

/** Options of one enhancement call. */
export interface EnhanceCallOptions {
  route: RoutePair
  /** System prompt text (the effective strategy). */
  system: string
  /** The raw draft to rewrite. */
  text: string
  temperature: number
  maxTokens: number
  /** End-to-end deadline in milliseconds. */
  timeoutMs: number
  /** Caller cancellation (HTTP request / command dispatch). */
  signal?: AbortSignal
  /** Session identity stamped onto the request for adapter routing. */
  sessionId?: string
}

/**
 * Rewrite one draft through the LLM service and normalize the output.
 * @param llm - the `ctx.llm` service (or a structural stub).
 * @param options - the call options.
 * @returns the normalized enhanced text plus the route and duration.
 * @throws EnhanceFailure with a displayable message; the caller's draft is
 *   never touched by this module.
 */
export async function enhanceText(llm: LlmStreamFace, options: EnhanceCallOptions): Promise<EnhanceResult> {
  const started = Date.now()
  const controller = new AbortController()
  let timedOut = false
  let callerAborted = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, options.timeoutMs)
  const onCallerAbort = (): void => {
    if (!timedOut) callerAborted = true
    controller.abort()
  }
  options.signal?.addEventListener('abort', onCallerAbort, { once: true })
  // A pre-aborted caller signal must refuse before any model traffic.
  if (options.signal?.aborted) {
    callerAborted = true
    controller.abort()
  }
  const signal = controller.signal
  const fail = (detail: EnhanceError): never => {
    throw new EnhanceFailure(detail)
  }
  try {
    signal.throwIfAborted()
    const messages = [
      createUserMessage({
        content: [{ type: 'text', text: frameUserPrompt(options.text) }],
        source: { kind: 'plugin', plugin: 'dsh-prompt-enhance' },
      }),
    ]
    const generate: GenerateOptions = {
      provider: options.route.provider,
      model: options.route.model,
      system: options.system,
      messages,
      temperature: options.temperature,
      maxTokens: options.maxTokens,
      signal,
      ...options.sessionId !== undefined ? { sessionId: options.sessionId as GenerateOptions['sessionId'] } : {},
    }
    const assembler = new BlockAssembler()
    const iterator = llm.stream(generate)[Symbol.asyncIterator]()
    // Race the iteration against the deadline: an adapter that stalls without
    // yielding must still hit the timeout (per-chunk checks alone would hang).
    let onAbort: (() => void) | undefined
    const aborted = new Promise<never>((_, reject) => {
      onAbort = () => {
        const error = new Error('prompt-enhance: aborted')
        error.name = 'AbortError'
        reject(error)
      }
      if (signal.aborted) onAbort()
      else signal.addEventListener('abort', onAbort, { once: true })
    })
    let exhausted = false
    try {
      while (true) {
        signal.throwIfAborted()
        const next = await Promise.race([iterator.next(), aborted])
        if (next.done) {
          exhausted = true
          break
        }
        assembler.push(next.value)
      }
    } finally {
      if (onAbort !== undefined && !signal.aborted) signal.removeEventListener('abort', onAbort)
      // On timeout/cancel the pending next() never settles, so the loop exits
      // without exhausting the iterator — prompt the underlying stream to
      // finalize its connection instead of leaving it to the GC.
      if (!exhausted) {
        void Promise.resolve(iterator.return?.()).catch(() => {})
      }
    }
    signal.throwIfAborted()
    const finishError = finishToDetail(assembler.finish)
    if (finishError !== undefined) fail(finishError)
    const blocks = assembler.blocks()
    if (blocks.some((block) => block.type === 'tool-call')) {
      fail({ code: 'upstream', message: '模型返回了工具调用，提示词增强只需要纯文本；请更换模型后重试。' })
    }
    const joined = blocks.filter((block) => block.type === 'text').map((block) => block.text).join('\n')
    const text = normalizeOutput(joined)
    if (text === '') {
      fail({ code: 'upstream', message: '模型返回为空，请重试；原输入未改动。' })
    }
    return { text, provider: options.route.provider, model: options.route.model, elapsedMs: Date.now() - started }
  } catch (error) {
    if (error instanceof EnhanceFailure) throw error
    if (timedOut) {
      throw new EnhanceFailure({ code: 'timeout', message: `增强超时（${Math.round(options.timeoutMs / 1000)} 秒），可重试；原输入未改动。` })
    }
    if (callerAborted || (error instanceof Error && error.name === 'AbortError')) {
      throw new EnhanceFailure({ code: 'internal', message: '增强已被取消；原输入未改动。' })
    }
    throw new EnhanceFailure({ code: 'internal', message: `增强失败：${describe(error)}；原输入未改动。` })
  } finally {
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', onCallerAbort)
  }
}

/**
 * Render the model-request route failure the user can act on. Known stable
 * codes get a fix hint; everything else surfaces the provider message.
 */
function finishToDetail(reason: FinishReason): EnhanceError | undefined {
  switch (reason.kind) {
    case 'stop':
      return undefined
    case 'max-tokens':
      return { code: 'upstream', message: '重写结果达到输出上限（maxOutputTokens），请在设置中调大上限或精简原文后重试。' }
    case 'tool-calls':
      return { code: 'upstream', message: '模型请求了工具调用，提示词增强只需要纯文本；请更换模型后重试。' }
    case 'error':
    case 'aborted':
      return { code: mapCode(reason.failure.code), message: upstreamMessage(reason.failure.message, reason.failure.code) }
    default:
      return { code: 'internal', message: `模型调用以未知方式结束：${String(reason)}` }
  }
}

/** Stable upstream codes with a dedicated fix hint. */
const CODE_HINTS: Record<string, string> = {
  AUTH: '鉴权失败：请检查该 provider 的 API Key 配置。',
  INVALID_CREDENTIAL: '鉴权失败：存储的 API Key 不可用，请修正后重试。',
  RATE_LIMIT: '模型服务限流，请稍后重试。',
  QUOTA_EXCEEDED: '模型服务配额/余额不足，请检查账户。',
  EMPTY_RESPONSE: '模型返回了空响应，请重试。',
  CONTEXT_WINDOW_EXCEEDED: '输入超出模型上下文窗口，请精简原文或更换模型。',
}

/** Map a provider failure code onto the wire taxonomy. */
function mapCode(code: string): EnhanceError['code'] {
  return code === 'NO_ADAPTER' ? 'unconfigured' : 'upstream'
}

/** Compose the displayable upstream message. */
function upstreamMessage(message: string, code: string): string {
  const hint = CODE_HINTS[code]
  const base = hint ?? `模型服务返回错误：${message}`
  return `${base}原输入未改动。`
}

/** Best-effort unknown-error rendering. */
function describe(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

/**
 * Narrow any thrown value into the wire error shape.
 * @param error - the thrown value.
 * @returns the structured error for the response envelope.
 */
export function toEnhanceError(error: unknown): EnhanceError {
  if (error instanceof EnhanceFailure) return error.detail
  const anyError = error as { detail?: EnhanceError } | null
  if (anyError !== null && typeof anyError === 'object' && anyError.detail !== undefined && typeof anyError.detail.code === 'string' && typeof anyError.detail.message === 'string') {
    return anyError.detail
  }
  return { code: 'internal', message: `增强失败：${describe(error)}；原输入未改动。` }
}
