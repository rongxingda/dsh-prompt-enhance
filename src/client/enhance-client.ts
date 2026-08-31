/**
 * Browser-side client of the POST /prompt-enhance/enhance host route:
 * same-origin fetch with abort support and a typed error surface. Every
 * failure is a structured EnhanceError the panel renders verbatim.
 * @module dsh-prompt-enhance/client/enhance-client
 */

import { ENHANCE_ENDPOINT, type EnhanceError, type EnhanceErrorCode, type EnhanceRequestBody, type EnhanceResult } from '../shared/protocol'

/** Typed fetch failure carrying the wire error. */
export class EnhanceClientError extends Error {
  constructor(public readonly detail: EnhanceError) {
    super(detail.message)
  }
}

/** The stable error codes the host may send; anything else normalizes to `internal`. */
const KNOWN_ERROR_CODES = new Set<EnhanceErrorCode>([
  'rejected',
  'rate-limit',
  'concurrency-limit',
  'timeout',
  'upstream',
  'unconfigured',
  'internal',
])

/** Narrow one wire error, normalizing unknown codes. `message`/`params` are optional. */
function parseError(value: unknown): EnhanceError {
  const record = value as Partial<EnhanceError> | null
  if (record !== null && typeof record === 'object') {
    const code: EnhanceErrorCode = typeof record.code === 'string' && KNOWN_ERROR_CODES.has(record.code as EnhanceErrorCode)
      ? record.code as EnhanceErrorCode
      : 'internal'
    const message = typeof record.message === 'string' && record.message !== '' ? record.message : undefined
    const params = record.params !== null && typeof record.params === 'object'
      ? record.params as Record<string, string | number>
      : undefined
    return { code, ...(message !== undefined ? { message } : {}), ...(params !== undefined ? { params } : {}) }
  }
  return { code: 'internal', message: '宿主服务返回异常。' }
}

/** Strictly narrow one success value; anything malformed is a client-visible error. */
function parseResult(value: unknown): EnhanceResult {
  const record = value as Partial<EnhanceResult> | null
  if (
    record !== null && typeof record === 'object'
    && typeof record.text === 'string' && record.text !== ''
    && typeof record.provider === 'string' && record.provider !== ''
    && typeof record.model === 'string' && record.model !== ''
    && typeof record.elapsedMs === 'number' && Number.isFinite(record.elapsedMs)
  ) {
    return { text: record.text, provider: record.provider, model: record.model, elapsedMs: record.elapsedMs }
  }
  throw new EnhanceClientError({ code: 'internal', message: '宿主服务返回了无法解析的结果。' })
}

/** Read and validate the response envelope. */
async function readEnvelope(response: Response): Promise<EnhanceResult> {
  let parsed: unknown
  try {
    parsed = await response.json()
  } catch {
    throw new EnhanceClientError({ code: 'internal', message: '宿主服务返回了无法解析的响应。' })
  }
  const envelope = parsed as { ok?: unknown; value?: EnhanceResult; error?: EnhanceError } | null
  if (envelope !== null && typeof envelope === 'object' && envelope.ok === true) {
    return parseResult(envelope.value)
  }
  if (envelope !== null && typeof envelope === 'object' && envelope.error !== undefined) {
    throw new EnhanceClientError(parseError(envelope.error))
  }
  throw new EnhanceClientError({ code: 'internal', message: `宿主服务返回异常（HTTP ${response.status}）。` })
}

/**
 * Request one enhancement from the host route.
 * @param body - the session id and the raw draft text.
 * @param signal - caller cancellation (panel cancel button / unmount).
 * @returns the enhancement result.
 * @throws EnhanceClientError with a displayable message on every failure.
 */
export async function requestEnhance(body: EnhanceRequestBody, signal?: AbortSignal): Promise<EnhanceResult> {
  let response: Response
  try {
    response = await fetch(ENHANCE_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })
  } catch (error) {
    if (signal?.aborted) {
      throw new EnhanceClientError({ code: 'internal', message: '已取消增强；原输入未改动。' })
    }
    void error
    throw new EnhanceClientError({ code: 'internal', message: '无法连接宿主服务，请确认 dsh web 正在运行后重试。' })
  }
  return readEnvelope(response)
}
