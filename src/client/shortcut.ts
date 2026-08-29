/**
 * Configurable keyboard shortcut: parse the settings string (e.g.
 * "ctrl+alt+e") into a normalized combo and match keyboard events. Pure —
 * no listeners, fully unit-tested.
 * @module dsh-prompt-enhance/client/shortcut
 */

/** One parsed shortcut combo. */
export interface ShortcutCombo {
  readonly ctrl: boolean
  readonly alt: boolean
  readonly shift: boolean
  readonly meta: boolean
  /** Final key: a single letter a-z, digit 0-9, or f1-f12. */
  readonly key: string
}

/** Modifier token aliases recognized before the final key token. */
const MODIFIER_ALIASES: ReadonlyMap<string, keyof Omit<ShortcutCombo, 'key'>> = new Map([
  ['ctrl', 'ctrl'],
  ['control', 'ctrl'],
  ['alt', 'alt'],
  ['option', 'alt'],
  ['shift', 'shift'],
  ['meta', 'meta'],
  ['cmd', 'meta'],
  ['command', 'meta'],
  ['win', 'meta'],
  ['super', 'meta'],
])

/** Function-key whitelist f1-f12; everything else must be one alphanumeric character. */
const isKeyToken = (token: string): boolean => /^[a-z0-9]$/.test(token) || /^f([1-9]|1[0-2])$/.test(token)

/** Modifier flags of a combo. */
type ModifierFlags = Record<'ctrl' | 'alt' | 'shift' | 'meta', boolean>

/**
 * Parse a user-configured shortcut spec. Whitespace and case are free; the
 * key token must come last; empty spec parses to null (shortcut disabled).
 * @param spec - the raw settings string.
 * @returns the normalized combo, or null when the spec is unusable.
 */
export function parseShortcut(spec: string | undefined): ShortcutCombo | null {
  if (spec === undefined) return null
  const tokens = spec.trim().toLowerCase().split('+').map((token) => token.trim()).filter((token) => token !== '')
  if (tokens.length === 0 || tokens.length > 5) return null
  const modifiers: ModifierFlags = { ctrl: false, alt: false, shift: false, meta: false }
  const last = tokens[tokens.length - 1] ?? ''
  if (!isKeyToken(last)) return null
  for (const token of tokens.slice(0, -1)) {
    const modifier = MODIFIER_ALIASES.get(token)
    if (modifier === undefined) return null
    modifiers[modifier] = true
  }
  return { ...modifiers, key: last }
}

/**
 * Whether one keyboard event matches a parsed combo.
 * @param event - the DOM keyboard event.
 * @param combo - the parsed combo (null matches nothing).
 * @returns true only on an exact modifier+key match.
 */
export function matchesShortcut(event: KeyboardEvent, combo: ShortcutCombo | null): boolean {
  if (combo === null) return false
  return (
    event.ctrlKey === combo.ctrl
    && event.altKey === combo.alt
    && event.shiftKey === combo.shift
    && event.metaKey === combo.meta
    && event.key.toLowerCase() === combo.key
  )
}
