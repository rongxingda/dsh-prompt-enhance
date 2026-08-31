/**
 * Wire contract shared by the host route and the browser half: one enhance
 * POST and its typed responses. Pure types and constants only, safe to
 * bundle into both halves.
 * @module dsh-prompt-enhance/shared/protocol
 */

/** Host route path the browser half POSTs the draft to. */
export const ENHANCE_ENDPOINT = '/prompt-enhance/enhance'

/** Request body of one enhance call. */
export interface EnhanceRequestBody {
  /** Session whose model route should serve the call; absent forces settings/defaults. */
  sessionId?: string
  /** The raw draft text to rewrite. */
  text: string
}

/** One successful enhancement. */
export interface EnhanceResult {
  /** The rewritten prompt body (already normalized: no fences, trimmed). */
  text: string
  /** Provider route that served the call. */
  provider: string
  /** Model id that served the call. */
  model: string
  /** Wall-clock duration of the model call in milliseconds. */
  elapsedMs: number
}

/**
 * Stable error codes the browser half maps to localized copy. The two
 * admission rejections are separate codes because their recovery conditions
 * differ: the per-minute rate cap clears on a known schedule (the route sends
 * a `Retry-After` in seconds with it), while the concurrency cap clears as
 * soon as an in-flight call finishes — no predictable delay to advertise.
 */
export type EnhanceErrorCode =
  | 'rejected'
  | 'rate-limit'
  | 'concurrency-limit'
  | 'timeout'
  | 'upstream'
  | 'unconfigured'
  | 'internal'

/** Structured failure carried on every non-2xx / ok:false response. */
export interface EnhanceError {
  code: EnhanceErrorCode
  /**
   * Optional diagnostic detail, passed through verbatim: the provider's raw
   * failure message, a config error, or an unknown-error description. The
   * client renders its localized primary line from `code`/`params` and shows
   * this beneath it when present — host-side text is a detail, never the
   * primary line (which used to leak Chinese copy into non-Chinese UIs).
   */
  message?: string
  /**
   * Structured parameters the localized primary line interpolates:
   * - rate-limit: { limit, retryAfterSeconds }
   * - concurrency-limit: { max }
   * - timeout: { seconds }
   * - rejected with { count, max }: the over-length input message
   * - upstream: optional { reason } selecting a fix hint (auth, quota, …)
   */
  params?: Record<string, string | number>
  /**
   * Optional pre-localized message the client already rendered in the user's
   * language (set by client-side guards). When present the client shows it
   * alone; otherwise it localizes by `code`/`params` and shows `message` as
   * detail.
   */
  localized?: string
}

/** Response envelope of the enhance route. */
export type EnhanceResponse =
  | { ok: true; value: EnhanceResult }
  | { ok: false; error: EnhanceError }
