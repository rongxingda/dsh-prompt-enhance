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
import { effectiveSystemPrompt, type Config } from './config'
import { DEFAULT_SYSTEM_PROMPT } from './prompts'
import { enhanceText, resolveRoute, toEnhanceError, type RoutePair } from './enhancer'
import { isTrustedRequest } from './loopback'
import { readBoundedJson, writeJson } from './http'

/** Structural face of the sessions store (brand types stay out of the wire path). */
interface SessionsFace {
  get(id: string): { requestHeader?: { config?: { provider?: unknown; model?: unknown } } } | undefined
}

/** Structural face of the settings provider for cross-namespace reads. */
interface SettingsFace {
  get(ns: string): unknown
}

/** Envelope slack over the UTF-8 text cap: JSON quoting can inflate ~2-6x in the worst case. */
const bodyCapOf = (maxInputChars: number): number => maxInputChars * 6 + 4096

/**
 * The session's logged request route (provider/model of its last request
 * header), when a live session with a request header exists.
 */
function sessionRouteOf(ctx: Context, sessionId: string | undefined): RoutePair | undefined {
  if (sessionId === undefined || sessionId === '') return undefined
  const config = (ctx.get('sessions') as SessionsFace | undefined)?.get(sessionId)?.requestHeader?.config
  return routeOf(config)
}

/** The harness-wide default model selection registered by dsh-agent-default-model. */
export function defaultRouteOf(ctx: Context): RoutePair | undefined {
  const value = (ctx.get('settings') as SettingsFace | undefined)?.get('agent-default-model')
  if (value === null || typeof value !== 'object') return undefined
  return routeOf(value as { provider?: unknown; model?: unknown })
}

/** Narrow an untrusted provider/model pair into a route. */
function routeOf(config: { provider?: unknown; model?: unknown } | undefined): RoutePair | undefined {
  if (config === undefined) return undefined
  const { provider, model } = config
  if (typeof provider !== 'string' || typeof model !== 'string' || provider === '' || model === '') return undefined
  return { provider, model }
}

/**
 * Serve one enhance POST against the request envelope.
 * @param ctx - registrant context (llm, optional sessions/settings).
 * @param readConfig - per-request config reader.
 * @param req - the incoming request.
 * @param res - the outgoing response.
 */
async function serveEnhance(ctx: Context, readConfig: () => Config, req: IncomingMessage, res: ServerResponse): Promise<void> {
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
  const route = resolveRoute(config, sessionRouteOf(ctx, sessionId), defaultRouteOf(ctx))
  if (route === undefined) {
    writeJson(res, 409, {
      ok: false,
      error: {
        code: 'unconfigured',
        message: '尚未确定增强用的模型：请在插件设置中成对填写 provider/model，或先在当前会话发送一条消息（将跟随会话模型）。',
      },
    })
    return
  }
  const llm = ctx.get('llm')
  if (llm === undefined) {
    writeJson(res, 500, { ok: false, error: { code: 'internal', message: 'LLM 服务不可用。' } })
    return
  }
  // Cancel the model call when the browser goes away mid-flight. `res.close`
  // also fires after a normal response completes, so guard with
  // `writableEnded` — only a premature close aborts the call.
  const callerAbort = new AbortController()
  const onConnectionClosed = (): void => {
    if (!res.writableEnded) callerAbort.abort()
  }
  res.on('close', onConnectionClosed)
  try {
    const value = await enhanceText(llm, {
      route,
      system: effectiveSystemPrompt(config, DEFAULT_SYSTEM_PROMPT),
      text: record.text,
      temperature: config.temperature,
      maxTokens: config.maxOutputTokens,
      timeoutMs: config.timeoutMs,
      signal: callerAbort.signal,
      ...sessionId !== undefined ? { sessionId } : {},
    })
    writeJson(res, 200, { ok: true, value })
  } catch (error) {
    const wire = toEnhanceError(error)
    writeJson(res, wire.code === 'timeout' ? 504 : wire.code === 'unconfigured' ? 409 : 502, { ok: false, error: wire })
  } finally {
    res.off('close', onConnectionClosed)
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
  webserver.register({
    kind: 'prefix',
    path: ENHANCE_ENDPOINT.replace(/\/enhance$/, ''),
    handler: (req: IncomingMessage, res: ServerResponse): Promise<void> => serveEnhance(ctx, readConfig, req, res),
  })
}
