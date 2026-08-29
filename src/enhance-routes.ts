/**
 * The POST /prompt-enhance/enhance host route: the browser half's single
 * seam. Loopback-fenced, body-capped, per-request config re-read (settings
 * changes land on the very next call), route resolved by precedence
 * (settings pair → session request header → harness default model).
 * @module dsh-prompt-enhance/enhance-routes
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import { ENHANCE_ENDPOINT } from './shared/protocol'
import { checkInputText, formatInputCheckZh } from './shared/validate'
import { type Config } from './config'
import { toEnhanceError } from './enhancer'
import { runEnhance, sessionRouteOf } from './orchestrate'
import { isTrustedRequest } from './loopback'
import { readBoundedJson, writeJson } from './http'

/** Envelope slack over the UTF-8 text cap: JSON quoting can inflate ~2-6x in the worst case. */
const bodyCapOf = (maxInputChars: number): number => maxInputChars * 6 + 4096

/** Per-mount admission state: sliding-window rate stamps + active-call count. */
interface AdmissionGate {
  stamps: number[]
  active: number
}

/**
 * Serve one enhance POST against the request envelope.
 * @param ctx - registrant context (llm, optional sessions/settings).
 * @param readConfig - per-request config reader.
 * @param req - the incoming request.
 * @param res - the outgoing response.
 */
async function serveEnhance(ctx: Context, readConfig: () => Config, gate: AdmissionGate, req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!isTrustedRequest(req)) {
    writeJson(res, 403, { ok: false, error: { code: 'internal', message: 'forbidden: loopback-only' } })
    return
  }
  // One route, one exact endpoint: anything else under the prefix is unknown.
  const pathname = new URL(req.url ?? '/', 'http://x').pathname
  if (pathname !== ENHANCE_ENDPOINT) {
    writeJson(res, 404, { ok: false, error: { code: 'internal', message: 'not found' } })
    return
  }
  if (req.method !== 'POST') {
    writeJson(res, 405, { ok: false, error: { code: 'internal', message: 'only POST is allowed' } })
    return
  }
  const config = readConfig()
  // Fail before reading the body when the plugin is switched off.
  if (!config.enabled) {
    writeJson(res, 403, { ok: false, error: { code: 'rejected', message: '提示词增强已在设置中关闭。' } })
    return
  }
  let body: unknown
  try {
    body = await readBoundedJson(req, bodyCapOf(config.maxInputChars))
  } catch (error) {
    const tooLarge = error instanceof Error && error.message === 'body too large'
    writeJson(res, tooLarge ? 413 : 422, {
      ok: false,
      error: { code: 'rejected', message: tooLarge ? '请求体超过大小上限。' : '请求体不是有效的 JSON。' },
    })
    return
  }
  const record = body as { sessionId?: unknown; text?: unknown } | null
  if (record === null || typeof record !== 'object' || typeof record.text !== 'string') {
    writeJson(res, 422, { ok: false, error: { code: 'rejected', message: '请求体必须是 { sessionId?, text } JSON。' } })
    return
  }
  const sessionId = typeof record.sessionId === 'string' && record.sessionId !== '' ? record.sessionId : undefined
  const check = checkInputText(record.text, config.maxInputChars)
  if (!check.ok) {
    writeJson(res, 422, { ok: false, error: { code: 'rejected', message: formatInputCheckZh(check) } })
    return
  }
  // Admission gate (after validation, so only real calls consume budget):
  // sliding-window rate cap, then concurrency cap. Rejected calls answer 429
  // with the configured limits so the user can act.
  const now = Date.now()
  while (gate.stamps.length > 0 && now - (gate.stamps[0] ?? now) >= 60000) gate.stamps.shift()
  if (gate.stamps.length >= config.rateLimitPerMinute) {
    writeJson(res, 429, { ok: false, error: { code: 'rate', message: `请求过于频繁：每分钟最多 ${config.rateLimitPerMinute} 次增强，请稍后再试。` } })
    return
  }
  if (gate.active >= config.maxConcurrent) {
    writeJson(res, 429, { ok: false, error: { code: 'rate', message: `已有 ${config.maxConcurrent} 个增强在进行中，请等待完成后再试。` } })
    return
  }
  gate.stamps.push(now)
  gate.active += 1
  // Cancel the model call when the browser goes away mid-flight. `res.close`
  // also fires after a normal response completes, so guard with
  // `writableEnded` — only a premature close aborts the call.
  const callerAbort = new AbortController()
  const onConnectionClosed = (): void => {
    if (!res.writableEnded) callerAbort.abort()
  }
  res.on('close', onConnectionClosed)
  try {
    const value = await runEnhance(ctx, config, {
      text: record.text,
      sessionRoute: sessionRouteOf(ctx, sessionId),
      signal: callerAbort.signal,
      ...sessionId !== undefined ? { sessionId } : {},
    })
    writeJson(res, 200, { ok: true, value })
  } catch (error) {
    const wire = toEnhanceError(error)
    writeJson(res, wire.code === 'timeout' ? 504 : wire.code === 'unconfigured' ? 409 : 502, { ok: false, error: wire })
  } finally {
    res.off('close', onConnectionClosed)
    gate.active -= 1
  }
}

/**
 * Register the /prompt-enhance prefix route on the shared webserver. Absent
 * webserver (non-web composition) is a silent no-op, matching the
 * describe-image family pattern.
 * @param ctx - registrant context; webServer is required.
 * @param readConfig - per-request config reader so settings changes apply immediately.
 */
export function registerEnhanceRoute(ctx: Context, readConfig: () => Config): void {
  const webserver = ctx.get('webServer')
  if (webserver === undefined) return
  const gate: AdmissionGate = { stamps: [], active: 0 }
  webserver.register({
    kind: 'prefix',
    path: ENHANCE_ENDPOINT.replace(/\/enhance$/, ''),
    handler: (req: IncomingMessage, res: ServerResponse): Promise<void> => serveEnhance(ctx, readConfig, gate, req, res),
  })
}
