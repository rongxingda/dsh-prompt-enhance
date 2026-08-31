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
 * Count one text in Unicode code points — the single length gauge shared by
 * validation, error messages, and host logs. An emoji or a composed character
 * is one character to the user, so every layer counts it the same way; mixing
 * this with the UTF-16 code-unit count of `String.length` makes a user-visible
 * number disagree with the logged one.
 * @param text - the text to measure.
 * @returns the code-point count.
 */
export function countText(text: string): number {
  return [...text].length
}

/**
 * Judge one draft text: non-empty after trimming (invisible characters do
 * not count) and within the configured character cap. Length is measured by
 * {@link countText} — Unicode code points, matching user perception — so an
 * emoji is one character, not two UTF-16 units. Over-length input is
 * rejected, never truncated — truncation would change the user's meaning.
 * @param text - the raw draft text.
 * @param maxChars - the configured character cap (in code points).
 * @returns the structured verdict.
 */
export function checkInputText(text: string, maxChars: number): InputCheck {
  const stripped = text.replace(INVISIBLE_CHARS, '')
  if (stripped.trim().length === 0) {
    return { ok: false, code: 'empty' }
  }
  const codePoints = countText(text)
  if (codePoints > maxChars) {
    return { ok: false, code: 'too-long', count: codePoints, max: maxChars }
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
  return `内容共 ${check.count} 个字符，超过 ${check.max} 个字符上限（按 Unicode 字符数统计，不是 token 数）。为避免改变原意不会自动截断，请精简后再试。`
}
