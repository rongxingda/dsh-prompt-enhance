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
  'panel.stale.warn': '草稿在增强期间有改动——增强结果基于增强前的文本。回填将覆盖你的最新编辑(撤销可恢复回填前的草稿)。',
  'panel.model': '模型：{provider} / {model}',
  'panel.elapsed': '耗时 {ms}',
  'undo.applied': '已用增强结果替换原提示词',
  'undo.undo': '撤销',
  'undo.dismiss': '关闭提示',
  'error.empty': '输入框为空，请先输入要增强的提示词。',
  'error.tooLong': '内容共 {count} 个字符，超过 {max} 个字符上限（按 Unicode 字符数统计，不是 token 数）。为避免改变原意不会自动截断，请精简后再试。',
  'error.imagesOnly': '当前只附加了图片，仅支持增强文本内容。',
  'error.occurrences': '输入内容包含命令或文件引用，暂不支持增强；请先移除后再试。',
  'error.phase': '当前输入正被占用（提交中），请稍后再试。',
  'error.disabled': '提示词增强已在插件设置中关闭。',
  'error.rejected': '增强请求被拒绝。',
  'error.timeout': '增强超时（{seconds} 秒），请重试；原输入未改动。',
  'error.unconfigured': '尚未确定增强用的模型：请在插件设置中成对填写 provider/model，或先在当前会话发送一条消息（将跟随会话模型）。',
  'error.upstream': '模型服务返回错误，请重试；原输入未改动。',
  'error.internal': '增强失败，请重试；原输入未改动。',
  'error.rateLimit': '请求过于频繁：每分钟最多 {limit} 次增强，请在 {retryAfterSeconds} 秒后再试。',
  'error.concurrencyLimit': '已有 {max} 个增强正在进行，请等其中一个完成后再试。',
  'error.upstream.auth': '鉴权失败：请检查该 provider 的 API Key 配置。',
  'error.upstream.invalidCredential': '鉴权失败：存储的 API Key 不可用，请修正后重试。',
  'error.upstream.rateLimit': '模型服务限流，请稍后重试。',
  'error.upstream.quota': '模型服务配额/余额不足，请检查账户。',
  'error.upstream.empty': '模型返回了空响应，请重试。',
  'error.upstream.contextWindow': '输入超出模型上下文窗口，请精简原文或更换模型。',
  'error.upstream.toolCall': '模型请求了工具调用，提示词增强只需要纯文本；请更换模型后重试。',
  'error.upstream.maxTokens': '重写结果达到输出上限（maxOutputTokens），请在设置中调大上限或精简原文后重试。',
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
  'panel.stale.warn': 'The draft changed while enhancing — the result is based on the pre-enhance text. Applying will overwrite your latest edits (undo restores the draft as it was before applying).',
  'panel.model': 'Model: {provider} / {model}',
  'panel.elapsed': '{ms} elapsed',
  'undo.applied': 'Original prompt replaced by the enhanced version',
  'undo.undo': 'Undo',
  'undo.dismiss': 'Dismiss',
  'error.empty': 'The input box is empty — type a prompt to enhance first.',
  'error.tooLong': 'The draft is {count} characters, above the {max} cap (Unicode characters, not tokens). It is never auto-truncated (that would change your meaning) — please shorten it.',
  'error.imagesOnly': 'Only images are attached; prompt enhance supports text only.',
  'error.occurrences': 'The draft contains commands or file references, which are not supported yet — remove them first.',
  'error.phase': 'The input box is busy (submitting) — try again in a moment.',
  'error.disabled': 'Prompt enhance is disabled in the plugin settings.',
  'error.rejected': 'The enhance request was rejected.',
  'error.timeout': 'The enhancement timed out ({seconds}s). Retry; your draft is untouched.',
  'error.unconfigured': 'No model resolved for the enhancement: pair provider/model in the plugin settings, or send a message in the current session first (the enhancement will follow the session model).',
  'error.upstream': 'The model provider returned an error. Retry; your draft is untouched.',
  'error.internal': 'Enhancement failed. Retry; your draft is untouched.',
  'error.rateLimit': 'Too many requests — at most {limit} enhancements per minute; retry in {retryAfterSeconds} seconds.',
  'error.concurrencyLimit': '{max} enhancements are already running — wait for one to finish, then retry.',
  'error.upstream.auth': 'Authentication failed — check the API key configured for this provider.',
  'error.upstream.invalidCredential': 'Authentication failed — the stored API key is invalid; fix it and retry.',
  'error.upstream.rateLimit': 'The model provider is rate-limiting; retry later.',
  'error.upstream.quota': 'The model provider reports a quota/balance issue — check your account.',
  'error.upstream.empty': 'The model returned an empty response; retry.',
  'error.upstream.contextWindow': 'The input exceeds the model context window — shorten it or switch models.',
  'error.upstream.toolCall': 'The model requested tool calls, but prompt enhance needs plain text — switch models and retry.',
  'error.upstream.maxTokens': 'The rewrite hit the output cap (maxOutputTokens) — raise it in settings or shorten the draft.',
}

/** Both shipped dictionaries, keyed by locale id. */
export const dictionaries: Record<'zh', typeof zh> & Record<'en', Record<PromptEnhanceKey, string>> = { zh, en }

/** Locale namespace of the browser half. */
export const NS = 'prompt-enhance' as const

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The prompt-enhance button/panel copy. */
    'prompt-enhance': PromptEnhanceKey
  }
}
