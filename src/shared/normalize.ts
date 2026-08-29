/**
 * Output normalization for the model's rewritten prompt. The system prompt
 * already demands a bare body; this is the second line of defense against
 * fences, stray whitespace, and degenerate empties.
 * @module dsh-prompt-enhance/shared/normalize
 */

/** Three or more consecutive newlines collapse to one blank line. */
const EXCESS_BLANK_LINES = /\n{3,}/g

/**
 * Normalize one model output into the final enhanced prompt body. A wrapping
 * code fence is stripped when the text starts with one, ends with one, and
 * contains exactly two fence marks (open + close) — this also covers
 * single-line fences like `` ```角色：翻译``` ``. Fences anywhere else are part
 * of the content (e.g. multiple code blocks) and must survive untouched.
 * @param raw - the assembled text output of the model.
 * @returns the normalized body; empty string when nothing usable remains.
 */
export function normalizeOutput(raw: string): string {
  let text = raw.trim()
  const fenceMarkCount = (text.match(/```/g) ?? []).length
  if (text.startsWith('```') && /```[\s]*$/.test(text) && fenceMarkCount === 2) {
    if (text.includes('\n')) {
      text = text.slice(text.indexOf('\n') + 1).replace(/```[\s]*$/, '').trim()
    } else {
      text = text.slice(3, -3).trim()
    }
  }
  text = text.replace(EXCESS_BLANK_LINES, '\n\n')
  return text.trim()
}
