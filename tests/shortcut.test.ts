import { describe, expect, it } from 'vitest'
import { matchesShortcut, parseShortcut } from '../src/client/shortcut'

const keydown = (fields: Partial<KeyboardEvent> & { key: string; code?: string }): KeyboardEvent =>
  ({ ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...fields }) as KeyboardEvent

describe('parseShortcut', () => {
  it('parses the default combo with case and space freedom', () => {
    expect(parseShortcut('Ctrl + Alt + E')).toEqual({ ctrl: true, alt: true, shift: false, meta: false, key: 'e', code: 'KeyE' })
    expect(parseShortcut('ctrl+alt+e')).toEqual({ ctrl: true, alt: true, shift: false, meta: false, key: 'e', code: 'KeyE' })
  })

  it('recognizes modifier aliases', () => {
    expect(parseShortcut('cmd+shift+p')).toEqual({ ctrl: false, alt: false, shift: true, meta: true, key: 'p', code: 'KeyP' })
    expect(parseShortcut('control+k')).toEqual({ ctrl: true, alt: false, shift: false, meta: false, key: 'k', code: 'KeyK' })
    expect(parseShortcut('option+1')).toEqual({ ctrl: false, alt: true, shift: false, meta: false, key: '1', code: 'Digit1' })
  })

  it('accepts function keys', () => {
    expect(parseShortcut('ctrl+f9')?.key).toBe('f9')
    expect(parseShortcut('ctrl+f9')?.code).toBe('F9')
  })

  it('rejects shift-only combos (they fire while typing capital letters)', () => {
    expect(parseShortcut('shift+e')).toBeNull()
    expect(parseShortcut('shift+a')).toBeNull()
  })

  it('treats shift as an extra modifier next to ctrl/alt/meta', () => {
    expect(parseShortcut('ctrl+shift+e')).toEqual({ ctrl: true, alt: false, shift: true, meta: false, key: 'e', code: 'KeyE' })
  })

  it('rejects bare keys without any modifier (they would swallow typing)', () => {
    expect(parseShortcut('e')).toBeNull()
    expect(parseShortcut('1')).toBeNull()
    expect(parseShortcut('f9')).toBeNull()
  })

  it('rejects empty, bare, reversed, and unknown tokens', () => {
    expect(parseShortcut('')).toBeNull()
    expect(parseShortcut('   ')).toBeNull()
    expect(parseShortcut('ctrl')).toBeNull()
    expect(parseShortcut('e+ctrl')).toBeNull()
    expect(parseShortcut('ctrl+alt+!')).toBeNull()
    expect(parseShortcut('ctrl+alt+e+extra')).toBeNull()
    expect(parseShortcut(undefined)).toBeNull()
  })
})

describe('matchesShortcut', () => {
  const combo = parseShortcut('ctrl+alt+e')

  it('matches the exact combo', () => {
    expect(matchesShortcut(keydown({ key: 'e', code: 'KeyE', ctrlKey: true, altKey: true }), combo)).toBe(true)
    expect(matchesShortcut(keydown({ key: 'E', code: 'KeyE', ctrlKey: true, altKey: true }), combo)).toBe(true)
  })

  it('matches ctrl+shift+digit via event.code even though the browser reports the shifted character', () => {
    const digitCombo = parseShortcut('ctrl+shift+1')
    expect(digitCombo).toEqual({ ctrl: true, alt: false, shift: true, meta: false, key: '1', code: 'Digit1' })
    // Shift+1 reports key='!' on US layouts — the code is what matches.
    expect(matchesShortcut(keydown({ key: '!', code: 'Digit1', ctrlKey: true, shiftKey: true }), digitCombo)).toBe(true)
    // Unshifted events still match the same combo.
    expect(matchesShortcut(keydown({ key: '1', code: 'Digit1', ctrlKey: true, shiftKey: true }), digitCombo)).toBe(true)
    // Without shift the modifiers no longer match.
    expect(matchesShortcut(keydown({ key: '1', code: 'Digit1', ctrlKey: true }), digitCombo)).toBe(false)
  })

  it('rejects missing or extra modifiers and wrong keys', () => {
    expect(matchesShortcut(keydown({ key: 'e', code: 'KeyE', ctrlKey: true }), combo)).toBe(false)
    expect(matchesShortcut(keydown({ key: 'e', code: 'KeyE', ctrlKey: true, altKey: true, shiftKey: true }), combo)).toBe(false)
    expect(matchesShortcut(keydown({ key: 'r', code: 'KeyR', ctrlKey: true, altKey: true }), combo)).toBe(false)
  })

  it('never matches a null combo (disabled)', () => {
    expect(matchesShortcut(keydown({ key: 'e', code: 'KeyE', ctrlKey: true, altKey: true }), null)).toBe(false)
  })
})
