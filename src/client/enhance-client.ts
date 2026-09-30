/**
 * Browser-side client of the POST /prompt-enhance/enhance host route:
 * same-origin fetch with abort support and a typed error surface. Every
 * failure is a structured EnhanceError the panel renders verbatim.
 * @module dsh-prompt-enhance/client/enhance-client
 */

import { ENHANCE_ENDPOINT, ENHANCE_STREAM_ENDPOINT, type EnhanceError, type EnhanceErrorCode, type EnhanceRequestBody, type EnhanceResult, type EnhanceStreamEvent } from '../shared/protocol'

/** Typed fetch failure carrying the wire error. */
export class EnhanceClientError extends Error {
  constructor(public readonly detail: EnhanceError) {
    super(detail.message)
  }
}

/**
 * Encode one request body.
 *
 * UTF-8 bytes rather than a bare string: with `types: ["node"]` the `BodyInit`
 * union has no `string` member (the DOM-only `string` form relies on the
 * global fetch types), and the explicit encoder also makes the wire size of a
 * CJK-heavy draft statable instead of implicit.
 * @param body - the typed request envelope.
 * @returns the UTF-8 encoded JSON payload.
 */
function jsonBody(body: EnhanceRequestBody): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(body))
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

/** One SSE frame: the event name line and the `data:` payload line. */
interface StreamFrame {
  event: string
  data: string
}

/** Split one buffer into complete SSE frames; the remainder stays buffered. */
function takeFrames(buffer: string): { frames: StreamFrame[]; rest: string } {
  const frames: StreamFrame[] = []
  let rest = buffer
  for (let index = rest.indexOf('\n\n'); index !== -1; index = rest.indexOf('\n\n')) {
    const raw = rest.slice(0, index)
    rest = rest.slice(index + 2)
    let event = 'message'
    const data: string[] = []
    for (const line of raw.split('\n')) {
      if (line.startsWith(':')) continue
      if (line.startsWith('event:')) event = line.slice(6).trim()
      else if (line.startsWith('data:')) data.push(line.slice(5).trim())
    }
    if (data.length > 0) frames.push({ event, data: data.join('\n') })
  }
  return { frames, rest }
}

/** Narrow one stream frame into a typed event; unparseable frames are skipped. */
function parseFrame(frame: StreamFrame): EnhanceStreamEvent | undefined {
  if (frame.event !== 'delta' && frame.event !== 'done' && frame.event !== 'error') return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(frame.data)
  } catch {
    return undefined
  }
  const record = parsed as { type?: unknown } | null
  if (record === null || typeof record !== 'object' || record.type !== frame.event) return undefined
  return record as EnhanceStreamEvent
}

/** Incremental enhancement options. */
export interface EnhanceStreamOptions {
  /** Caller cancellation (panel cancel button / unmount). */
  signal?: AbortSignal
  /** Receives each newly displayable piece of text. */
  onDelta: (text: string) => void
}

/**
 * Request one enhancement and show it while it is written.
 *
 * Degrades to {@link requestEnhance} whenever the incremental path is not
 * actually available: an older host without the stream route, a proxy that
 * buffered the response into one blob, or a browser without a readable fetch
 * body. The result is the same normalized body either way — only the display
 * is progressive.
 * @param body - the session id and the raw draft text.
 * @param options - cancellation and the delta sink.
 * @returns the enhancement result.
 * @throws EnhanceClientError with a displayable message on every failure.
 */
export async function requestEnhanceStream(body: EnhanceRequestBody, options: EnhanceStreamOptions): Promise<EnhanceResult> {
  let response: Response
  try {
    response = await fetch(ENHANCE_STREAM_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
      body: jsonBody(body),
      signal: options.signal,
    } as RequestInit)
  } catch (error) {
    if (options.signal?.aborted) {
      throw new EnhanceClientError({ code: 'internal', message: '已取消增强；原输入未改动。' })
    }
    void error
    throw new EnhanceClientError({ code: 'internal', message: '无法连接宿主服务，请确认 dsh web 正在运行后重试。' })
  }
  const contentType = String(response.headers.get('content-type') ?? '').toLowerCase()
  const stream = response.body
  const streamable = response.ok && stream !== null && stream !== undefined && contentType.includes('event-stream')
  if (stream === null || stream === undefined || !streamable) {
    // Not a stream (old host, buffered proxy, or a rejection that predates
    // the stream): release the body and take the one-shot path instead.
    // `cancel()` may return a promise in some runtimes and undefined in
    // others, so wrap before catching rather than assuming a promise.
    void Promise.resolve().then(() => stream?.cancel()).catch(() => {})
    return requestEnhance(body, options.signal)
  }
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const { frames, rest } = takeFrames(buffer)
      buffer = rest
      for (const frame of frames) {
        const event = parseFrame(frame)
        if (event === undefined) continue
        if (event.type === 'delta') options.onDelta(event.text)
        else if (event.type === 'done') return parseResult(event.value)
        else throw new EnhanceClientError(parseError(event.error))
      }
    }
  } finally {
    void Promise.resolve().then(() => reader.cancel()).catch(() => {})
  }
  throw new EnhanceClientError({ code: 'internal', message: '宿主服务提前关闭了增强流，请重试；原输入未改动。' })
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
      body: jsonBody(body),
      signal,
    } as RequestInit)
  } catch (error) {
    if (signal?.aborted) {
      throw new EnhanceClientError({ code: 'internal', message: '已取消增强；原输入未改动。' })
    }
    void error
    throw new EnhanceClientError({ code: 'internal', message: '无法连接宿主服务，请确认 dsh web 正在运行后重试。' })
  }
  return readEnvelope(response)
}
