/**
 * Browser-side client of the POST /prompt-enhance/enhance host route:
 * same-origin fetch with abort support and a typed error surface. Every
 * failure is a structured EnhanceError the panel renders verbatim.
 * @module dsh-prompt-enhance/client/enhance-client
 */

import { ENHANCE_ENDPOINT, type EnhanceError, type EnhanceRequestBody, type EnhanceResult } from '../shared/protocol'

/** Typed fetch failure carrying the wire error. */
export class EnhanceClientError extends Error {
  constructor(public readonly detail: EnhanceError) {
    super(detail.message)
  }
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
    const value = envelope.value
    if (value !== undefined && typeof value.text === 'string' && value.text !== '') return value
  }
  if (envelope !== null && typeof envelope === 'object' && envelope.error !== undefined && typeof envelope.error.message === 'string') {
    throw new EnhanceClientError(envelope.error)
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
