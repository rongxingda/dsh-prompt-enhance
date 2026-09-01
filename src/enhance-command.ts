/**
 * The `/enhance` slash command: rewrites its argument text through the same
 * host routine as the composer button and shows the result in the command
 * plane (copyable, never entering model history). Enhancing the composer
 * draft itself stays a client-side concern (button / shortcut), because the
 * draft lives in the browser.
 * @module dsh-prompt-enhance/enhance-command
 */

import type { Context } from '@deepseek-ai/cordis'
import type { CommandDefinition, CommandInvocation } from '@deepseek-ai/dsh-commands'
import { checkInputText, formatInputCheckZh } from './shared/validate'
import { type Config } from './config'
import { formatEnhanceError, toEnhanceError } from './enhancer'
import { runEnhance, sessionRouteOf } from './orchestrate'

/** Structural face of the commands registry (optional service). */
interface CommandsFace {
  register(definition: CommandDefinition): () => void
}

/**
 * Register the /enhance command on the (optional) commands service. Absent
 * service is a silent no-op so the plugin still loads in UI-less spines.
 * @param ctx - registrant context.
 * @param readConfig - per-call config reader.
 */
export function registerEnhanceCommand(ctx: Context, readConfig: () => Config): void {
  const commands = ctx.get('commands') as unknown as CommandsFace | undefined
  if (commands === undefined) return
  const definition: CommandDefinition = {
    name: 'enhance',
    description: '提示词增强：/enhance <文本> —— 重写为结构化提示词，结果在此展示可复制，不进入对话历史',
    input: { hint: '要增强的文本（增强输入框草稿请用输入框按钮或快捷键）' },
    recordInput: false,
    async handler(invocation: CommandInvocation) {
      const raw = invocation.rawInput.trim()
      if (raw === '') {
        return { kind: 'error', text: '用法：/enhance <文本>。要增强输入框里的草稿，请用输入框右侧的「增强」按钮或快捷键。' }
      }
      const config = readConfig()
      if (!config.enabled) {
        return { kind: 'error', text: '提示词增强已在插件设置中关闭。' }
      }
      const check = checkInputText(raw, config.maxInputChars)
      if (!check.ok) {
        return { kind: 'error', text: formatInputCheckZh(check) }
      }
      try {
        const value = await runEnhance(ctx, config, {
          text: raw,
          sessionRoute: sessionRouteOf(ctx, invocation.agent.session.id),
          signal: invocation.signal,
          sessionId: invocation.agent.session.id,
        })
        return { kind: 'success', text: value.text }
      } catch (error) {
        return { kind: 'error', text: formatEnhanceError(toEnhanceError(error)) }
      }
    },
  }
  ctx.effect(() => commands.register(definition))
}
