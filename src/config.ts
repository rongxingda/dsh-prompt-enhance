/**
 * Plugin configuration: one schemastery schema rendered automatically by
 * Settings → 插件配置, plus pure resolution/validation shared by the host
 * route, the slash command, and (mirrored defaults) the browser half.
 * @module dsh-prompt-enhance/config
 */

import z from 'schemastery'

/** Settings namespace of the plugin section. */
export const PROMPT_ENHANCE_NAMESPACE = 'prompt-enhance'

/** The plugin's deployed configuration. */
export interface Config {
  /** Master switch; off hides the composer button and disables all triggers. */
  enabled: boolean
  /** Explicit provider override; must be paired with `model`. */
  provider?: string
  /** Explicit model override; must be paired with `provider`. */
  model?: string
  /** Sampling temperature; low keeps the rewrite faithful to the original. */
  temperature: number
  /** Output token budget of one enhancement call. */
  maxOutputTokens: number
  /** Input character cap; over-length drafts are rejected, never truncated. */
  maxInputChars: number
  /** End-to-end deadline of one enhancement call. */
  timeoutMs: number
  /** System prompt; default is the built-in enhancement strategy. */
  systemPrompt: string
  /** Composer keyboard shortcut, e.g. "ctrl+alt+e"; empty disables it. */
  shortcut: string
}

/** Field defaults, the source of truth for schema defaults and client mirrors. */
export const DEFAULT_CONFIG: Config = {
  enabled: true,
  temperature: 0.3,
  maxOutputTokens: 2048,
  maxInputChars: 12000,
  timeoutMs: 60000,
  systemPrompt: '',
  shortcut: 'ctrl+alt+e',
}

/** The settings section schema (rendered by the built-in plugin config page). */
export const Config: z<Config> = z.object({
  enabled: z.boolean().default(DEFAULT_CONFIG.enabled).description('总开关：关闭后隐藏输入框增强按钮并停用所有触发方式'),
  provider: z.string().description('覆盖模型路由的 provider（与「模型」必须成对填写；留空跟随当前会话模型）'),
  model: z.string().description('覆盖模型路由的 model（与「provider」必须成对填写；留空跟随当前会话模型）'),
  temperature: z.number().min(0).max(1).step(0.05).default(DEFAULT_CONFIG.temperature).description('采样温度；低温改写更忠实于原意'),
  maxOutputTokens: z.number().step(1).min(256).max(32768).default(DEFAULT_CONFIG.maxOutputTokens).description('单次增强的输出 token 上限'),
  maxInputChars: z.number().step(1).min(200).max(200000).default(DEFAULT_CONFIG.maxInputChars).description('输入字数上限；超限拒绝而不截断，避免改变原意'),
  timeoutMs: z.number().step(1).min(5000).max(600000).default(DEFAULT_CONFIG.timeoutMs).description('单次增强的超时（毫秒）'),
  systemPrompt: z.string().role('textarea').default(DEFAULT_CONFIG.systemPrompt).description('系统提示词；留空使用内置增强策略，可整体替换'),
  shortcut: z.string().default(DEFAULT_CONFIG.shortcut).description('触发快捷键（如 ctrl+alt+e，留空禁用）'),
})

/**
 * Validate and detach one resolved config. The loader fills schema defaults
 * before apply; this re-checks the invariants the schema cannot express
 * (provider/model pairing, non-empty route strings) so a bad stored section
 * fails loud at the boundary instead of inside a model call.
 * @param config - untrusted resolved section.
 * @returns the validated config.
 * @throws Error describing the first violated invariant.
 */
export function resolveConfig(config: Config): Config {
  if (config === null || typeof config !== 'object') throw new Error('prompt-enhance: configuration is required')
  const hasProvider = config.provider !== undefined && config.provider !== ''
  const hasModel = config.model !== undefined && config.model !== ''
  if (hasProvider !== hasModel) {
    throw new Error('prompt-enhance: provider 与 model 必须成对填写（要么都填，要么都留空以跟随当前会话模型）')
  }
  if (hasProvider && config.provider!.trim() === '' || hasModel && config.model!.trim() === '') {
    throw new Error('prompt-enhance: provider/model 覆盖必须是非空字符串')
  }
  return { ...config }
}

/**
 * The effective system prompt: the configured override when non-empty, the
 * built-in strategy otherwise. Tolerates an absent field (older stored
 * sections predate the schema default).
 * @param config - the resolved config.
 * @param builtin - the built-in strategy prompt.
 * @returns the system prompt of the next call.
 */
export function effectiveSystemPrompt(config: Config, builtin: string): string {
  const custom = (config.systemPrompt ?? '').trim()
  return custom !== '' ? custom : builtin
}
