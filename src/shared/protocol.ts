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

/** Stable error codes the browser half maps to localized copy. */
export type EnhanceErrorCode = 'rejected' | 'timeout' | 'upstream' | 'unconfigured' | 'internal'

/** Structured failure carried on every non-2xx / ok:false response. */
export interface EnhanceError {
  code: EnhanceErrorCode
  /** Human-readable, directly displayable message (Chinese). */
  message: string
}

/** Response envelope of the enhance route. */
export type EnhanceResponse =
  | { ok: true; value: EnhanceResult }
  | { ok: false; error: EnhanceError }
