/**
 * Output normalization for the model's rewritten prompt. The system prompt
 * already demands a bare body; this is the second line of defense against
 * fences, stray whitespace, and degenerate empties.
 * @module dsh-prompt-enhance/shared/normalize
 */

/** One wrapping code fence with an optional language tag: ```lang\n...\n``` */
const WRAPPING_FENCE = /^```[^\n`]*\r?\n([\s\S]*?)\r?\n?```\s*$/

/** Three or more consecutive newlines collapse to one blank line. */
const EXCESS_BLANK_LINES = /\n{3,}/g

/**
 * Normalize one model output into the final enhanced prompt body.
 * @param raw - the assembled text output of the model.
 * @returns the normalized body; empty string when nothing usable remains.
 */
export function normalizeOutput(raw: string): string {
  let text = raw.trim()
  const fenced = WRAPPING_FENCE.exec(text)
  if (fenced?.[1] !== undefined) text = fenced[1].trim()
  text = text.replace(EXCESS_BLANK_LINES, '\n\n')
  return text.trim()
}
