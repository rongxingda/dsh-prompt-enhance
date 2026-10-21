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
import { installSettingsSource } from './settings-source'
import { PROMPT_ENHANCE_ROW_IDS } from './shared/protocol'
import { registerEnhanceRoute } from './enhance-routes'
import { registerEnhanceCommand } from './enhance-command'

export const name = 'prompt-enhance'
export const inject = ['llm', 'webServer']

export { Config, DEFAULT_CONFIG, PROMPT_ENHANCE_NAMESPACE, resolveConfig } from './config'
export type { StrategyMode } from './config'
export { installSettingsSource } from './settings-source'
export type { LegacySectionHooks, SettingsSource, SettingsSourceOptions } from './settings-source'
export { PROMPT_ENHANCE_ROW_IDS } from './shared/protocol'
export { DEFAULT_SYSTEM_PROMPT, frameUserPrompt } from './prompts'
export { enhanceText, formatEnhanceError, resolveRoute, toEnhanceError } from './enhancer'
export type { EnhanceCallOptions, LlmStreamFace, RoutePair, UpstreamReason } from './enhancer'
export { normalizeOutput } from './shared/normalize'
export { checkInputText } from './shared/validate'
export { ENHANCE_ENDPOINT } from './shared/protocol'
export type { EnhanceError, EnhanceResult, EnhanceRequestBody, EnhanceResponse, EnhanceErrorCode } from './shared/protocol'

/**
 * Mount the host half.
 *
 * The settings section is resolved through {@link installSettingsSource},
 * which speaks all three settings APIs in the field: the 0.2.x
 * `SettingsForms.describe()` reader, the 0.1.2-alpha `installSection`
 * installer, and the 0.1.1-rc standalone module. The reader answers per
 * request, so Settings → 插件配置 changes reach the very next call on every
 * generation — including the 0.2.x line, where the section installer no
 * longer exists at all and a boot-time snapshot would otherwise pin the
 * plugin to whatever it read at load.
 *
 * Besides the declared `inject` services (llm, webServer — both required),
 * the host half optionally reads three more through `ctx.get` with
 * `undefined` fallbacks, degrading gracefully when absent:
 * - `sessions` — the session's logged request route (model routing);
 * - `settings` — the operator's section, and the harness default model;
 * - `commands` — the `/enhance` slash command registration.
 * @param ctx - registrant context.
 * @param config - deployment configuration (schema defaults filled by the loader).
 */
export function apply(ctx: Context, config: PluginConfig = { ...DEFAULT_CONFIG }): void {
  const source = installSettingsSource(ctx, {
    namespace: PROMPT_ENHANCE_NAMESPACE,
    rowIds: PROMPT_ENHANCE_ROW_IDS,
    fallback: () => config,
    schema: Config,
    entry: config,
    hooks: {
      // The source keeps the pushed section itself (see settings-source), so
      // this hook only has to satisfy the legacy installer contract.
      setSource: () => {},
      onChange: () => {},
      validate: (value) => {
        resolveConfig(value as PluginConfig)
      },
    },
  })
  // Run every raw section through resolveConfig so the request path sees the
  // normalized form (trimmed provider/model, stripped legacy keys, validated
  // ranges) — the validate hook only refuses bad values, it never transforms.
  const readConfig = (): PluginConfig => resolveConfig(source.read() as PluginConfig)
  registerEnhanceRoute(ctx, readConfig)
  registerEnhanceCommand(ctx, readConfig)
}
