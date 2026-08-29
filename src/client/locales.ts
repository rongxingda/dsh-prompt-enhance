/**
 * The `prompt-enhance` client locale namespace: zh (key-set source of truth)
 * and en dictionaries for the composer button, preview panel, and undo bar.
 * @module dsh-prompt-enhance/client/locales
 */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'button.title': '提示词增强（重写为结构化提示词）',
  'button.busy': '正在增强…',
  'panel.title': '提示词增强',
  'panel.loading': '正在增强，稍候…',
  'panel.loading.hint': '原文保留在输入框中，不会被动修改。',
  'panel.cancel': '取消',
  'panel.original': '原始提示词',
  'panel.enhanced': '增强结果',
  'panel.apply': '回填到输入框',
  'panel.copy': '复制结果',
  'panel.copied': '已复制',
  'panel.copyFailed': '复制失败',
  'panel.close': '关闭',
  'panel.retry': '重试',
  'panel.model': '模型：{provider} / {model}',
  'panel.elapsed': '耗时 {ms}',
  'undo.applied': '已用增强结果替换原提示词',
  'undo.undo': '撤销',
  'undo.dismiss': '关闭提示',
  'error.empty': '输入框为空，请先输入要增强的提示词。',
  'error.tooLong': '内容共 {count} 字，超过 {max} 字上限。为避免改变原意不会自动截断，请精简后再试。',
  'error.imagesOnly': '当前只附加了图片，仅支持增强文本内容。',
  'error.occurrences': '输入内容包含命令或文件引用，暂不支持增强；请先移除后再试。',
  'error.busy': '正在增强中，请稍候或先取消。',
  'error.phase': '当前输入正被占用（提交中），请稍后再试。',
  'error.disabled': '提示词增强已在插件设置中关闭。',
} as const

/** Dictionary key union. */
export type PromptEnhanceKey = keyof typeof zh

/** English dictionary. */
export const en: Record<PromptEnhanceKey, string> = {
  'button.title': 'Enhance prompt (rewrite into a structured prompt)',
  'button.busy': 'Enhancing…',
  'panel.title': 'Prompt Enhance',
  'panel.loading': 'Enhancing, please wait…',
  'panel.loading.hint': 'Your draft stays untouched until you apply the result.',
  'panel.cancel': 'Cancel',
  'panel.original': 'Original prompt',
  'panel.enhanced': 'Enhanced result',
  'panel.apply': 'Fill into input box',
  'panel.copy': 'Copy result',
  'panel.copied': 'Copied',
  'panel.copyFailed': 'Copy failed',
  'panel.close': 'Close',
  'panel.retry': 'Retry',
  'panel.model': 'Model: {provider} / {model}',
  'panel.elapsed': '{ms} elapsed',
  'undo.applied': 'Original prompt replaced by the enhanced version',
  'undo.undo': 'Undo',
  'undo.dismiss': 'Dismiss',
  'error.empty': 'The input box is empty — type a prompt to enhance first.',
  'error.tooLong': 'The draft is {count} characters, above the {max} cap. It is never auto-truncated (that would change your meaning) — please shorten it.',
  'error.imagesOnly': 'Only images are attached; prompt enhance supports text only.',
  'error.occurrences': 'The draft contains commands or file references, which are not supported yet — remove them first.',
  'error.busy': 'An enhancement is already running — wait or cancel it first.',
  'error.phase': 'The input box is busy (submitting) — try again in a moment.',
  'error.disabled': 'Prompt enhance is disabled in the plugin settings.',
}

/** Both shipped dictionaries, keyed by locale id. */
export const dictionaries: Record<'zh', typeof zh> & Record<'en', Record<PromptEnhanceKey, string>> = { zh, en }

/** Locale namespace of the browser half. */
export const NS = 'prompt-enhance' as const

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The prompt-enhance button/panel copy. */
    [NS]: PromptEnhanceKey
  }
}
