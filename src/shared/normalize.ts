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
 * code fence is stripped only when the text STARTS with one, ENDS with one,
 * and contains no other fence lines — fences anywhere else are part of the
 * content (e.g. multiple code blocks) and must survive untouched.
 * @param raw - the assembled text output of the model.
 * @returns the normalized body; empty string when nothing usable remains.
 */
export function normalizeOutput(raw: string): string {
  let text = raw.trim()
  const fenceLineCount = (text.match(/^```/gm) ?? []).length
  if (text.startsWith('```') && /```[\s]*$/.test(text) && fenceLineCount === 2) {
    text = text.slice(text.indexOf('\n') + 1).replace(/```[\s]*$/, '').trim()
  }
  text = text.replace(EXCESS_BLANK_LINES, '\n\n')
  return text.trim()
}
