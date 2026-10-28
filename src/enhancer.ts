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
import type { ReasoningEffortChoice } from './config'

/**
 * Producer identity of this plugin's model traffic.
 *
 * dsh 0.2.x dropped the catch-all `{ kind: 'plugin' }` source and made
 * `MessageSourceMap` merge-extensible instead: every producer declares its own
 * `kind` in its own module, and consumers fall through kinds they do not know.
 * Declaring the kind here keeps the attribution honest (the harness can tell
 * this message was not typed by the user) and is the shape the harness's own
 * plugins use.
 */
declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'prompt-enhance': { kind: 'prompt-enhance' }
  }
}

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
export class EnhanceFailure extends Error {
  constructor(public readonly detail: EnhanceError) {
    super(detail.message ?? detail.code)
    this.name = 'EnhanceFailure'
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
  // Defensive trim: the explicit pair may come from a hand-edited settings
  // document, and `readConfig` normalization is best-effort defense in depth.
  const provider = typeof explicit?.provider === 'string' ? explicit.provider.trim() : ''
  const model = typeof explicit?.model === 'string' ? explicit.model.trim() : ''
  if (provider !== '' && model !== '') {
    return { provider, model }
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
  /**
   * Reasoning budget forwarded verbatim, or `inherit` to omit the field.
   *
   * Sent explicitly on purpose: leaving it out makes the adapter apply the
   * model's own default effort, which is the expensive path (measured on
   * deepseek-flash: 2897 output tokens at the default `high` versus 252 at
   * `off`, for the same draft and no better rewrite).
   */
  reasoningEffort: ReasoningEffortChoice
  maxTokens: number
  /** End-to-end deadline in milliseconds. */
  timeoutMs: number
  /** Caller cancellation (HTTP request / command dispatch). */
  signal?: AbortSignal
  /** Session identity stamped onto the request for adapter routing. */
  sessionId?: string
  /** The framed conversation-context snippet, when the call carries one. */
  context?: string
  /**
   * Receives each text delta as the model produces it (display only). May be
   * async — the streaming route's sink awaits socket backpressure. A throw, or
   * a rejected promise, is swallowed: a broken display path must never fail
   * the enhancement itself.
   */
  onDelta?: (delta: string) => void | Promise<void>
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
        content: [{ type: 'text', text: frameUserPrompt(options.text, options.context) }],
        source: { kind: 'prompt-enhance' },
      }),
    ]
    /**
     * Read one model call to completion, at a given reasoning budget.
     *
     * Split out of the enclosing function so the effort can be dropped and the
     * call retried once — see the `UNSUPPORTED_REASONING_EFFORT` handling below.
     * Each attempt needs a FRESH assembler and iterator: reusing either would
     * splice the first attempt's partial blocks into the second one's result.
     * @param effort - the effort to request, or `inherit` to omit the field.
     * @returns the assembled call, ready for the finish-reason checks.
     */
    const readCall = async (effort: ReasoningEffortChoice): Promise<{ assembler: BlockAssembler; exhausted: boolean }> => {
      const generate: GenerateOptions = {
        provider: options.route.provider,
        model: options.route.model,
        system: options.system,
        messages,
        temperature: options.temperature,
        maxTokens: options.maxTokens,
        signal,
        // `inherit` deliberately leaves the field unset, for a route that
        // rejects an explicit effort; `ReasoningEffortId` is a brand over the
        // effort id, hence the cast.
        ...effort === 'inherit' ? {} : { reasoningEffort: effort as NonNullable<GenerateOptions['reasoningEffort']> },
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
          // Display-only tap: the stream already arrives incrementally, so the
          // panel can show the rewrite as it is written instead of waiting for
          // the final normalization.
          if (next.value.type === 'text-delta' && options.onDelta !== undefined) {
            try {
              // The sink may be async (the SSE route awaits socket drain), so a
              // rejected promise is attached here too — an unhandled rejection
              // from a display-only path must not surface as a process warning.
              void Promise.resolve(options.onDelta(next.value.text)).catch(() => {})
            } catch {
              // Never let a broken display path fail the enhancement.
            }
          }
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
      return { assembler, exhausted }
    }
    // The configured effort, and the one a downgrade retry falls back to:
    // `inherit` leaves the field off the request entirely.
    const requestedEffort: ReasoningEffortChoice = options.reasoningEffort
    // One model call per attempt; the loop exists only for the single effort
    // downgrade below, so it can never spin more than twice.
    let retriedWithoutEffort = false
    const readAttempt = async (): Promise<
      { ok: true; blocks: ReturnType<BlockAssembler['blocks']> } | { ok: false; detail: EnhanceError }
    > => {
      while (true) {
        let attempt: { assembler: BlockAssembler; exhausted: boolean }
        try {
          attempt = await readCall(retriedWithoutEffort ? 'inherit' : requestedEffort)
        } catch (error) {
          // Defence for a host that rejects the effort somewhere the harness's
          // own terminal conversion does not cover; on a current host this does
          // not fire (see the finish check right below).
          if (retriedWithoutEffort || requestedEffort === 'inherit' || !isEffortRejectionThrow(error)) throw error
          retriedWithoutEffort = true
          continue
        }
        signal.throwIfAborted()
        // A route whose model declares no reasoning capability rejects an
        // explicit effort outright (harness code `UNSUPPORTED_REASONING_EFFORT`)
        // before any provider I/O. The harness delivers that as a terminal
        // `error` FINISH CHUNK, not a throw: "Adapter selection, dispatch, and
        // iteration failures become terminal `error` or `aborted` finish chunks;
        // middleware, nested-call, cleanup, and consumer failures remain
        // thrown" (dsh-llm/lib/types/index.js). The code is read off the finish
        // reason itself, because flattening it into our `EnhanceError` loses it.
        //
        // There is no provider work to redo — only the field to drop — so defer
        // to `inherit` once and keep the cheap `off` default working everywhere
        // else rather than paying every model the expensive model-default
        // effort. With `inherit` configured we sent no effort, so a retry would
        // repeat the identical request and fail the same way — surfaced instead
        // of retried. The rejected attempt's assembler is discarded: reusing it
        // would splice its partial blocks into the retry.
        const rejected = isEffortRejectionFinish(attempt.assembler.finish)
        if (retriedWithoutEffort || requestedEffort === 'inherit' || !rejected) {
          const detail = finishToDetail(attempt.assembler.finish)
          return detail === undefined ? { ok: true, blocks: attempt.assembler.blocks() } : { ok: false, detail }
        }
        retriedWithoutEffort = true
      }
    }
    const outcome = await readAttempt()
    if (!outcome.ok) {
      return fail(outcome.detail)
    }
    const blocks = outcome.blocks
    if (blocks.some((block) => block.type === 'tool-call')) {
      fail({ code: 'upstream', params: { reason: 'tool-call' } })
    }
    const joined = blocks.filter((block) => block.type === 'text').map((block) => block.text).join('\n')
    const text = normalizeOutput(joined)
    if (text === '') {
      fail({ code: 'upstream', params: { reason: 'empty' } })
    }
    return { text, provider: options.route.provider, model: options.route.model, elapsedMs: Date.now() - started }
  } catch (error) {
    if (error instanceof EnhanceFailure) throw error
    if (timedOut) {
      throw new EnhanceFailure({ code: 'timeout', params: { seconds: Math.ceil(options.timeoutMs / 1000) } })
    }
    if (callerAborted || (error instanceof Error && error.name === 'AbortError')) {
      // Deliberately no detail line: the caller knows it cancelled.
      throw new EnhanceFailure({ code: 'internal' })
    }
    throw new EnhanceFailure({ code: 'internal', message: describe(error) })
  } finally {
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', onCallerAbort)
  }
}

/**
 * Render the model-request route failure the user can act on. Known stable
 * codes map to a dedicated `reason` the dictionaries localize; everything
 * else passes the provider message through as the detail line.
 */
function finishToDetail(reason: FinishReason): EnhanceError | undefined {
  switch (reason.kind) {
    case 'stop':
      return undefined
    case 'max-tokens':
      return { code: 'upstream', params: { reason: 'max-tokens' } }
    case 'tool-calls':
      return { code: 'upstream', params: { reason: 'tool-call' } }
    case 'error':
    case 'aborted':
      return { code: mapCode(reason.failure.code), message: reason.failure.message, ...upstreamReasonOf(reason.failure.code) }
    default:
      return { code: 'internal', message: String(reason) }
  }
}

/** Stable upstream reasons the dictionaries and formatEnhanceError both know. */
export type UpstreamReason =
  | 'auth'
  | 'invalid-credential'
  | 'rate-limit'
  | 'quota'
  | 'empty'
  | 'context-window'
  | 'tool-call'
  | 'max-tokens'

/** Known provider failure codes with a dedicated fix hint; others stay generic. */
const REASON_CODES: Record<string, UpstreamReason> = {
  AUTH: 'auth',
  INVALID_CREDENTIAL: 'invalid-credential',
  RATE_LIMIT: 'rate-limit',
  QUOTA_EXCEEDED: 'quota',
  EMPTY_RESPONSE: 'empty',
  CONTEXT_WINDOW_EXCEEDED: 'context-window',
}

/** The params fragment carrying the fix-hint reason, when the code is known. */
function upstreamReasonOf(code: string): { params: { reason: UpstreamReason } } | undefined {
  const reason = REASON_CODES[code]
  return reason === undefined ? undefined : { params: { reason } }
}

/** Map a provider failure code onto the wire taxonomy. */
function mapCode(code: string): EnhanceError['code'] {
  return code === 'NO_ADAPTER' ? 'unconfigured' : 'upstream'
}

/** Host-side zh rendering of one wire error, used by the /enhance command plane. */
const REASON_HINTS: Record<UpstreamReason, string> = {
  auth: '鉴权失败：请检查该 provider 的 API Key 配置。',
  'invalid-credential': '鉴权失败：存储的 API Key 不可用，请修正后重试。',
  'rate-limit': '模型服务限流，请稍后重试。',
  quota: '模型服务配额/余额不足，请检查账户。',
  empty: '模型返回了空响应，请重试。',
  'context-window': '输入超出模型上下文窗口，请精简原文或更换模型。',
  'tool-call': '模型请求了工具调用，提示词增强只需要纯文本；请更换模型后重试。',
  'max-tokens': '重写结果达到输出上限（maxOutputTokens），请在设置中调大上限或精简原文后重试。',
}

/**
 * Render one wire error into displayable Chinese text for host-side surfaces
 * (the /enhance command plane has no browser locale dictionary). The primary
 * line comes from `code`/`params`; a `message` detail (provider raw message,
 * config error) is appended beneath it when present.
 */
export function formatEnhanceError(error: EnhanceError): string {
  const params = error.params ?? {}
  let text: string
  switch (error.code) {
    case 'rejected': text = '增强请求被拒绝。'; break
    case 'rate-limit': text = `请求过于频繁：每分钟最多 ${params.limit ?? '?'} 次增强，请 ${params.retryAfterSeconds ?? '稍候'} 秒后再试。`; break
    case 'concurrency-limit': text = `已有 ${params.max ?? '?'} 个增强在进行中，请等待其中一个完成后再试。`; break
    case 'cooldown': text = `连续 ${params.failures ?? '?'} 次增强失败，已暂停调用以避免持续冲击模型服务；请 ${params.retryAfterSeconds ?? '?'} 秒后重试，或先检查插件设置中的模型配置。`; break
    case 'timeout': text = `增强超时（${params.seconds ?? '?'} 秒），可重试；原输入未改动。`; break
    case 'unconfigured': text = '尚未确定增强用的模型：请在插件设置中成对填写 provider/model，或先在当前会话发送一条消息（将跟随会话模型）。'; break
    case 'upstream': text = typeof params.reason === 'string' ? (REASON_HINTS[params.reason as UpstreamReason] ?? '模型服务返回错误，请重试；原输入未改动。') : '模型服务返回错误，请重试；原输入未改动。'; break
    default: text = '增强失败，请重试；原输入未改动。'
  }
  const detail = error.message
  if (detail !== undefined && detail !== '') return `${text}\n${detail}`
  return text
}

/** Best-effort unknown-error rendering. */
function describe(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

/** The harness code for "this model declares no reasoning capability at all". */
const UNSUPPORTED_REASONING_EFFORT = 'UNSUPPORTED_REASONING_EFFORT'

/** Whether a harness code string is the "no reasoning capability" refusal. */
function isEffortRejectionCode(code: string | undefined): boolean {
  return code === UNSUPPORTED_REASONING_EFFORT
}

/**
 * Whether a terminal finish reason is the harness refusing our explicit effort.
 *
 * Read off `finish.failure.code`, which is where the code actually survives:
 * `normalizeLlmFailure` freezes `{ message: errorMessage(error), code:
 * harnessErrorCode(error) }`, and `harnessErrorCode` returns `error.code`
 * verbatim for any `HarnessError` (and `LlmError` is one), while `message` stays
 * the localized prose. The flattened `EnhanceError` cannot answer this — our
 * `mapCode` collapses every harness code into `upstream` — so the question is
 * asked here, before that collapse, and never of the message text, which is
 * prose that already changed once between harness versions.
 * @param reason - the attempt's terminal finish reason.
 * @returns true when the refusal is specifically about the reasoning effort.
 */
function isEffortRejectionFinish(reason: unknown): boolean {
  if (reason === null || typeof reason !== 'object') return false
  const { kind, failure } = reason as { kind?: unknown; failure?: unknown }
  if (kind !== 'error' || failure === null || typeof failure !== 'object') return false
  return isEffortRejectionCode((failure as { code?: string }).code)
}

/**
 * The same question for a thrown value, as defence in depth: a live host reports
 * the refusal as a terminal finish chunk, but a host that throws it must not
 * lose the deferral. `HarnessError` carries `code` as an own property, and
 * `toEnhanceError` copies it into `detail.message` rather than dropping it.
 * @param error - the thrown value.
 * @returns true when the throw is the reasoning-effort refusal.
 */
function isEffortRejectionThrow(error: unknown): boolean {
  if (error === null || typeof error !== 'object') return false
  const { code, failure } = error as { code?: unknown; failure?: unknown }
  if (isEffortRejectionCode(typeof code === 'string' ? code : undefined)) return true
  if (failure !== null && typeof failure === 'object') {
    return isEffortRejectionCode((failure as { code?: string }).code)
  }
  return false
}

/**
 * Narrow any thrown value into the wire error shape.
 * @param error - the thrown value.
 * @returns the structured error for the response envelope.
 */
export function toEnhanceError(error: unknown): EnhanceError {
  if (error instanceof EnhanceFailure) return error.detail
  const anyError = error as { detail?: EnhanceError } | null
  if (anyError !== null && typeof anyError === 'object' && anyError.detail !== undefined && typeof anyError.detail.code === 'string') {
    return anyError.detail
  }
  return { code: 'internal', message: describe(error) }
}
