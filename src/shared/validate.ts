/**
 * Pure input text checks shared by the host route and the browser half, so
 * the button can refuse locally with the exact verdict the host would send.
 * Messages are locale-owned: this module returns structured verdicts, the
 * host formats them in Chinese, the client passes them through its `t` seat.
 * @module dsh-prompt-enhance/shared/validate
 */

/** Verdict of one input check. */
export type InputCheck =
  | { ok: true }
  | { ok: false; code: 'empty' }
  | { ok: false; code: 'too-long'; count: number; max: number }

/** Zero-width and bidi control characters stripped before emptiness checks. */
const INVISIBLE_CHARS = /[\u200B-\u200D\uFEFF\u202A-\u202E\u2066-\u2069]/g

/**
 * Judge one draft text: non-empty after trimming (invisible characters do
 * not count) and within the configured character cap. Over-length input is
 * rejected, never truncated — truncation would change the user's meaning.
 * @param text - the raw draft text.
 * @param maxChars - the configured character cap.
 * @returns the structured verdict.
 */
export function checkInputText(text: string, maxChars: number): InputCheck {
  const stripped = text.replace(INVISIBLE_CHARS, '')
  if (stripped.trim().length === 0) {
    return { ok: false, code: 'empty' }
  }
  if (text.length > maxChars) {
    return { ok: false, code: 'too-long', count: text.length, max: maxChars }
  }
  return { ok: true }
}

/**
 * Render one verdict as the displayable Chinese message (host-side copy).
 * @param check - the structured verdict.
 * @returns the message; empty string for a passing check.
 */
export function formatInputCheckZh(check: InputCheck): string {
  if (check.ok) return ''
  if (check.code === 'empty') return '输入框为空，请先输入要增强的提示词。'
  return `内容共 ${check.count} 字，超过 ${check.max} 字上限。为避免改变原意不会自动截断，请精简后再试。`
}
