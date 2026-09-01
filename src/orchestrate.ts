/**
 * Shared orchestration for the two host-side enhance entries (the HTTP route
 * and the /enhance slash command): route resolution by precedence, LLM
 * service lookup, one enhanceText call. Keeping both entries on this path
 * prevents their behavior from drifting.
 * @module dsh-prompt-enhance/orchestrate
 */

import type { Context } from '@deepseek-ai/cordis'
import { randomUUID } from 'node:crypto'
import { effectiveSystemPrompt, type Config } from './config'
import { DEFAULT_SYSTEM_PROMPT } from './prompts'
import { EnhanceFailure, enhanceText, resolveRoute, toEnhanceError, type RoutePair } from './enhancer'
import type { EnhanceResult } from './shared/protocol'
import { countText } from './shared/validate'

/** Structural face of one logged request header (brand types stay off the wire path). */
interface EpochHeaderLike {
  config?: { provider?: unknown; model?: unknown }
}

/**
 * Structural face of the sessions store.
 *
 * `requestHeader` is a **method** in every dsh release checked so far —
 * `Session.requestHeader(): EpochHeader | undefined` (0.1.1-rc.2 `lib/index.js:1497`,
 * 0.1.2-alpha.3 `lib/index.js:1393`). Reading it as a property yields the
 * function object, whose `.config` is `undefined`, which silently disabled this
 * whole precedence layer. The property shape is still accepted defensively so a
 * flip in either direction degrades to the other branch instead of a TypeError.
 */
interface SessionsFace {
  get(id: string): { requestHeader?: (() => EpochHeaderLike | undefined) | EpochHeaderLike } | undefined
}

/** Structural face of the settings provider for cross-namespace reads. */
interface SettingsFace {
  get(ns: string): unknown
}

/** Narrow an untrusted provider/model pair into a route (trimmed). */
function routeOf(config: { provider?: unknown; model?: unknown } | null | undefined): RoutePair | undefined {
  if (config === null || config === undefined) return undefined
  const provider = typeof config.provider === 'string' ? config.provider.trim() : ''
  const model = typeof config.model === 'string' ? config.model.trim() : ''
  if (provider === '' || model === '') return undefined
  return { provider, model }
}

/**
 * The session's logged request route (provider/model of its last request
 * header), when a live session with a request header exists.
 */
export function sessionRouteOf(ctx: Context, sessionId: string | undefined): RoutePair | undefined {
  if (sessionId === undefined || sessionId === '') return undefined
  const session = (ctx.get('sessions') as SessionsFace | undefined)?.get(sessionId)
  const header = session?.requestHeader
  const epoch = typeof header === 'function' ? header.call(session) : header
  return routeOf(epoch?.config)
}

/** The harness-wide default model selection registered by dsh-agent-default-model. */
export function defaultRouteOf(ctx: Context): RoutePair | undefined {
  const value = (ctx.get('settings') as SettingsFace | undefined)?.get('agent-default-model')
  return routeOf(value as { provider?: unknown; model?: unknown } | undefined)
}

/** One orchestration request. */
export interface RunEnhanceOptions {
  /** The raw draft to rewrite (already validated by the caller). */
  text: string
  /** The session's logged request route, when known. */
  sessionRoute?: RoutePair
  /** Caller cancellation (HTTP disconnect / command dispatch). */
  signal?: AbortSignal
  /** Session identity stamped onto the request for adapter routing. */
  sessionId?: string
}

/**
 * Resolve the model route (settings pair → session route → harness default),
 * look up the LLM service, and run one normalized enhancement.
 * @throws an error whose `detail` (via `toEnhanceError`) carries the wire
 *   error — `unconfigured` when no route resolves, `internal` when the LLM
 *   service is absent, or whatever `enhanceText` raised.
 */
export async function runEnhance(ctx: Context, config: Config, options: RunEnhanceOptions): Promise<EnhanceResult> {
  // Structured, single-line observability: request id and sizes only — never
  // the prompt text, the model output, or the provider/model names (those can
  // carry internal gateway or project identifiers). Sizes use the same
  // code-point gauge the input check reports to the user, so the two never
  // disagree.
  const requestId = randomUUID().slice(0, 8)
  const started = Date.now()
  try {
    const route = resolveRoute(config, options.sessionRoute, defaultRouteOf(ctx))
    if (route === undefined) {
      // No detail line: the fix instructions are the localized primary copy.
      throw new EnhanceFailure({ code: 'unconfigured' })
    }
    const llm = ctx.get('llm')
    if (llm === undefined) {
      throw new EnhanceFailure({ code: 'internal' })
    }
    const result = await enhanceText(llm, {
      route,
      system: effectiveSystemPrompt(config, DEFAULT_SYSTEM_PROMPT),
      text: options.text,
      temperature: config.temperature,
      maxTokens: config.maxOutputTokens,
      timeoutMs: config.timeoutMs,
      signal: options.signal,
      ...(options.sessionId !== undefined ? { sessionId: options.sessionId } : {}),
    })
    console.info(`[prompt-enhance] ${requestId} in=${countText(options.text)} out=${countText(result.text)} ${result.elapsedMs}ms ok`)
    return result
  } catch (error) {
    const wire = toEnhanceError(error)
    console.info(`[prompt-enhance] ${requestId} in=${countText(options.text)} error=${wire.code} ${Date.now() - started}ms`)
    throw error
  }
}
