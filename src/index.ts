/**
 * Host half of the prompt-enhance plugin: the `prompt-enhance` settings
 * section, the POST /prompt-enhance/enhance route (LLM call through
 * ctx.llm, route resolved by precedence: settings pair → session request
 * header → harness default model), and the /enhance slash command. The
 * browser half (exports "./client") contributes the composer button, the
 * preview panel, and the undo bar.
 * @module dsh-prompt-enhance
 */

import type { Context } from '@deepseek-ai/cordis'
import { Config, DEFAULT_CONFIG, PROMPT_ENHANCE_NAMESPACE, resolveConfig, type Config as PluginConfig } from './config'
import { registerEnhanceRoute } from './enhance-routes'
import { registerEnhanceCommand } from './enhance-command'

export const name = 'prompt-enhance'
export const inject = ['llm', 'webServer']

export { Config, DEFAULT_CONFIG, PROMPT_ENHANCE_NAMESPACE, resolveConfig } from './config'
export type { StrategyMode } from './config'
export { DEFAULT_SYSTEM_PROMPT, frameUserPrompt } from './prompts'
export { enhanceText, formatEnhanceError, resolveRoute, toEnhanceError } from './enhancer'
export type { EnhanceCallOptions, LlmStreamFace, RoutePair, UpstreamReason } from './enhancer'
export { normalizeOutput } from './shared/normalize'
export { checkInputText } from './shared/validate'
export { ENHANCE_ENDPOINT } from './shared/protocol'
export type { EnhanceError, EnhanceResult, EnhanceRequestBody, EnhanceResponse, EnhanceErrorCode } from './shared/protocol'

/**
 * Register the settings section across harness generations.
 *
 * `@deepseek-ai/dsh-settings` changed its public surface between the 0.1.1-rc
 * line and the 0.1.2-alpha line:
 * - rc (0.1.1-rc.x): standalone `installSettingsSection(ctx, ns, …)` plus the
 *   `settingsNamespace()` brand helper — both module exports;
 * - alpha (0.1.2-alpha.x): the same wiring moved onto the service as
 *   `ctx.settings.installSection(owner, ns, …)`, and the standalone exports
 *   were removed.
 *
 * A static named import of the removed exports is a load-time SyntaxError on
 * alpha, so this file must not statically import them. Instead the section is
 * registered through `ctx.inject(['settings'])` — the service-availability
 * gate both generations use internally — with a runtime probe picking the API
 * the mounted service actually speaks. The legacy path goes through a dynamic
 * import so the alpha build never evaluates the removed names.
 */
function installSettingsSectionCompat(ctx: Context, namespace: string, schema: unknown, entry: unknown, hooks: {
  setSource: (source: () => unknown) => void
  onChange: () => void
  validate: (value: unknown) => void
}): void {
  ctx.inject(['settings'], (settingsCtx: Context) => {
    const service = (settingsCtx as unknown as { settings?: { installSection?: unknown } }).settings
    if (typeof service?.installSection === 'function') {
      ;(service.installSection as (owner: Context, ns: string, schema: unknown, entry: unknown, hooks: unknown) => void)(
        ctx, namespace, schema, entry, hooks,
      )
      return
    }
    // Legacy rc line: resolve the standalone helpers lazily. The module itself
    // exists in both cohorts; only its named exports differ. Types come from
    // the rc devDependency — on alpha the runtime probe simply never calls it.
    void import('@deepseek-ai/dsh-settings').then((mod) => {
      if (typeof mod.installSettingsSection === 'function') {
        mod.installSettingsSection(ctx, mod.settingsNamespace(namespace), schema as never, entry, hooks as never)
      }
    }, () => {
      // Settings integration is optional by design; the plugin keeps working
      // on its composition entry when the module cannot be resolved at all.
    })
  })
}

/**
 * Mount the host half. The settings section layers over the composition
 * entry and is re-resolved per request, so Settings → 插件配置 changes reach
 * the very next call.
 *
 * Besides the declared `inject` services (llm, webServer — both required),
 * the host half optionally reads three more through `ctx.get` with
 * `undefined` fallbacks, degrading gracefully when absent:
 * - `sessions` — the session's logged request route (model routing);
 * - `settings` — the harness default model (`agent-default-model`);
 * - `commands` — the `/enhance` slash command registration.
 * @param ctx - registrant context.
 * @param config - deployment configuration (schema defaults filled by the loader).
 */
export function apply(ctx: Context, config: PluginConfig = { ...DEFAULT_CONFIG }): void {
  let current: () => PluginConfig = () => config
  installSettingsSectionCompat(ctx, PROMPT_ENHANCE_NAMESPACE, Config, config, {
    setSource: (source) => {
      current = source as () => PluginConfig
    },
    onChange: () => {},
    validate: (value) => {
      resolveConfig(value as PluginConfig)
    },
  })
  // Run the raw settings through resolveConfig so the request path sees the
  // normalized form (trimmed provider/model, stripped legacy keys, validated
  // ranges) — the validate hook only refuses bad values, it never transforms.
  const readConfig = (): PluginConfig => resolveConfig(current())
  registerEnhanceRoute(ctx, readConfig)
  registerEnhanceCommand(ctx, readConfig)
}
