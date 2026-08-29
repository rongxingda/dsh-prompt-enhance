import { describe, expect, it } from 'vitest'
import { matchesShortcut, parseShortcut } from '../src/client/shortcut'

const keydown = (fields: Partial<KeyboardEvent> & { key: string }): KeyboardEvent =>
  ({ ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...fields }) as KeyboardEvent

describe('parseShortcut', () => {
  it('parses the default combo with case and space freedom', () => {
    expect(parseShortcut('Ctrl + Alt + E')).toEqual({ ctrl: true, alt: true, shift: false, meta: false, key: 'e' })
    expect(parseShortcut('ctrl+alt+e')).toEqual({ ctrl: true, alt: true, shift: false, meta: false, key: 'e' })
  })

  it('recognizes modifier aliases', () => {
    expect(parseShortcut('cmd+shift+p')).toEqual({ ctrl: false, alt: false, shift: true, meta: true, key: 'p' })
    expect(parseShortcut('control+k')).toEqual({ ctrl: true, alt: false, shift: false, meta: false, key: 'k' })
    expect(parseShortcut('option+1')).toEqual({ ctrl: false, alt: true, shift: false, meta: false, key: '1' })
  })

  it('accepts function keys', () => {
    expect(parseShortcut('ctrl+f9')?.key).toBe('f9')
  })

  it('rejects bare keys without any modifier (they would swallow typing)', () => {
    expect(parseShortcut('e')).toBeNull()
    expect(parseShortcut('1')).toBeNull()
    expect(parseShortcut('f9')).toBeNull()
  })

  it('still accepts single-modifier combos', () => {
    expect(parseShortcut('shift+e')).toEqual({ ctrl: false, alt: false, shift: true, meta: false, key: 'e' })
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
    expect(matchesShortcut(keydown({ key: 'e', ctrlKey: true, altKey: true }), combo)).toBe(true)
    expect(matchesShortcut(keydown({ key: 'E', ctrlKey: true, altKey: true }), combo)).toBe(true)
  })

  it('rejects missing or extra modifiers and wrong keys', () => {
    expect(matchesShortcut(keydown({ key: 'e', ctrlKey: true }), combo)).toBe(false)
    expect(matchesShortcut(keydown({ key: 'e', ctrlKey: true, altKey: true, shiftKey: true }), combo)).toBe(false)
    expect(matchesShortcut(keydown({ key: 'r', ctrlKey: true, altKey: true }), combo)).toBe(false)
  })

  it('never matches a null combo (disabled)', () => {
    expect(matchesShortcut(keydown({ key: 'e', ctrlKey: true, altKey: true }), null)).toBe(false)
  })
})
