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
import { DEFAULT_SYSTEM_PROMPT, withContextRules } from './prompts'
import { buildConversationContext } from './context'
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
  get(id: string): {
    requestHeader?: (() => EpochHeaderLike | undefined) | EpochHeaderLike
    /** The derived LLM message history; absent on hosts that never expose it. */
    deriveMessages?: () => readonly unknown[]
  } | undefined
}

/** Structural face of the settings provider for cross-namespace reads. */
interface SettingsFace {
  get(ns: string): unknown
}

/**
 * Read one entry from a cordis service that historically exposed a Map-like
 * `get`, guarding the service's presence, the method's EXISTENCE, and the call.
 *
 * A structural interface can promise `get`; only a runtime check keeps that
 * promise honest. dsh 0.1.5-rc.3 replaced the settings service with
 * `SettingsForms`, whose surface is configure/describe/update/replace/mutate —
 * **no synchronous `get`**. Calling through the old shape threw
 * `ctx.get(...)?.get is not a function`, and because this sits on every
 * enhance request's route-resolution path it turned every enhancement into a
 * 502. Missing readers must degrade to "no answer", never to a failed enhance.
 * @param ctx - registrant context.
 * @param service - cordis service name (`sessions`, `settings`).
 * @param key - the entry key (session id, settings namespace).
 * @returns the entry, or undefined when the shape cannot answer.
 */
function serviceEntry(ctx: Context, service: string, key: string): unknown {
  const holder = ctx.get(service) as { get?: unknown } | null | undefined
  if (holder === null || holder === undefined) return undefined
  if (typeof holder.get !== 'function') return undefined
  try {
    return (holder.get as (k: string) => unknown).call(holder, key)
  } catch {
    // A store-layer hiccup (unknown id, a future signature change, a getter
    // that throws) degrades to "no entry" — never a failed enhancement.
    return undefined
  }
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
  const session = serviceEntry(ctx, 'sessions', sessionId) as ReturnType<SessionsFace['get']> | undefined
  const header = session?.requestHeader
  let epoch: EpochHeaderLike | undefined
  try {
    epoch = typeof header === 'function' ? header.call(session) : header
  } catch {
    // A session-layer hiccup (frozen object, a future signature change,
    // anything a getter throws) must degrade to the harness default route —
    // never turn one enhance request into a 502 / 「增强失败」.
    return undefined
  }
  return routeOf(epoch?.config)
}

/**
 * Structural face of the dsh >= 0.1.5-rc.3 default-model service
 * (`ctx.agentDefaultModel`). Owned by dsh-agent-default-model, which stopped
 * publishing the selection through the settings namespace.
 */
interface AgentDefaultModelFace {
  currentSelection?: () => { provider?: unknown; model?: unknown } | undefined
}

/**
 * Read a `ModelSelection` out of an untrusted candidate, or nothing.
 *
 * Accepting a loose `unknown` matters here: this reaches across four dsh
 * release lines, and a wrong shape must read as "no answer", never throw.
 */
function selectionOf(candidate: unknown): RoutePair | undefined {
  if (candidate === null || candidate === undefined) return undefined
  const face = candidate as AgentDefaultModelFace
  if (typeof face.currentSelection !== 'function') return undefined
  try {
    return routeOf(face.currentSelection())
  } catch {
    return undefined
  }
}

/** Fetch a cordis service object without letting a cordis-level throw escape. */
function serviceOf(ctx: Context, name: string): unknown {
  try {
    return ctx.get(name)
  } catch {
    return undefined
  }
}

/** The harness-wide default model selection registered by dsh-agent-default-model. */
export function defaultRouteOf(ctx: Context): RoutePair | undefined {
  // Three ways exist to reach the same selection, one per host generation. Each
  // failure means "try the next", never "fail the enhance request":
  //
  // 1. dsh >= 0.1.5-rc.3 — the `agentDefaultModel` service, fetched BY NAME.
  //    `ctx.get` comes before the property because cordis throws
  //    `cannot get property "agentDefaultModel" without inject` when that
  //    property is read without declaring the dependency, and declaring it via
  //    `inject` is not survivable: hosts lacking the service would then never
  //    activate this plugin at all.
  const byGet = selectionOf(serviceOf(ctx, 'agentDefaultModel'))
  if (byGet !== undefined) return byGet

  // 2. Same service, reached as a property (harnesses that inject it for us).
  try {
    const byProp = selectionOf((ctx as Context & { agentDefaultModel?: AgentDefaultModelFace }).agentDefaultModel)
    if (byProp !== undefined) return byProp
  } catch {
    // Not injected on this host — fall through to the legacy read.
  }

  // 3. Legacy (<= 0.1.2-rc.1): a synchronous settings-namespace read. Those
  //    hosts expose it; later ones do not, and `serviceEntry` answers "no
  //    entry" instead of throwing `ctx.get(...)?.get is not a function` on
  //    every enhance request.
  const value = serviceEntry(ctx, 'settings', 'agent-default-model')
  return routeOf(value as { provider?: unknown; model?: unknown } | undefined)
}

/**
 * The conversation-context snippet for one enhancement, or nothing at all.
 *
 * Every failure mode here degrades to the ORIGINAL single-prompt behaviour:
 * context switched off, no session id (the 0.1.2-rc.1 input slots no longer
 * carry one), unknown session, missing/throws history, or a window too small
 * to admit a single turn. Grounding is an optimization, never a requirement —
 * an enhancement must never fail because history could not be read.
 * @param ctx - registrant context (optional `sessions`).
 * @param sessionId - the session the draft belongs to, when known.
 * @param config - the resolved config (switch + window).
 * @param draft - the raw draft being enhanced.
 * @returns the framed snippet, or undefined to run unconstrained.
 */
export function conversationContextOf(ctx: Context, sessionId: string | undefined, config: Config, draft: string): string | undefined {
  if (!config.contextAware) return undefined
  if (sessionId === undefined || sessionId === '') return undefined
  const session = serviceEntry(ctx, 'sessions', sessionId) as ReturnType<SessionsFace['get']> | undefined
  if (session === undefined) return undefined
  let messages: readonly unknown[]
  try {
    const derived = session.deriveMessages?.()
    if (derived === undefined || !Array.isArray(derived)) return undefined
    messages = derived
  } catch {
    // A session-layer hiccup must not turn one enhance request into a 502.
    return undefined
  }
  return buildConversationContext(
    messages,
    { maxMessages: config.contextMaxMessages, maxChars: config.contextMaxChars },
    draft,
  )
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
  /** Pre-built context snippet; when absent it is derived from the session. */
  context?: string
  /** Receives each text delta for incremental display (display only; may be async). */
  onDelta?: (delta: string) => void | Promise<void>
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
    const context = options.context !== undefined
      ? options.context
      : conversationContextOf(ctx, options.sessionId, config, options.text)
    const result = await enhanceText(llm, {
      route,
      // The context rules ride along ONLY when there is context to reason
      // about, so a context-free call keeps byte-identical instructions.
      system: effectiveSystemPrompt(config, context === undefined ? DEFAULT_SYSTEM_PROMPT : withContextRules(DEFAULT_SYSTEM_PROMPT)),
      text: options.text,
      temperature: config.temperature,
      maxTokens: config.maxOutputTokens,
      timeoutMs: config.timeoutMs,
      signal: options.signal,
      ...(context !== undefined ? { context } : {}),
      ...(options.onDelta !== undefined ? { onDelta: options.onDelta } : {}),
      ...(options.sessionId !== undefined ? { sessionId: options.sessionId } : {}),
    })
    console.info(`[prompt-enhance] ${requestId} in=${countText(options.text)} out=${countText(result.text)} ctx=${context === undefined ? 0 : 1} ${result.elapsedMs}ms ok`)
    return result
  } catch (error) {
    const wire = toEnhanceError(error)
    console.info(`[prompt-enhance] ${requestId} in=${countText(options.text)} error=${wire.code} ${Date.now() - started}ms`)
    throw error
  }
}
