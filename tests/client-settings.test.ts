import { describe, expect, it } from 'vitest'
import { decodeClientSettings, DEFAULT_CLIENT_SETTINGS } from '../src/client/settings'

describe('decodeClientSettings', () => {
  it('returns defaults for a missing or malformed section', () => {
    expect(decodeClientSettings(undefined)).toEqual(DEFAULT_CLIENT_SETTINGS)
    expect(decodeClientSettings(null)).toEqual(DEFAULT_CLIENT_SETTINGS)
    expect(decodeClientSettings('nope')).toEqual(DEFAULT_CLIENT_SETTINGS)
  })

  it('reads well-formed fields', () => {
    expect(
      decodeClientSettings({ enabled: false, maxInputChars: 8000, shortcut: 'ctrl+shift+e' }),
    ).toEqual({ enabled: false, maxInputChars: 8000, shortcut: 'ctrl+shift+e' })
  })

  it('falls back field-by-field on bad values', () => {
    expect(decodeClientSettings({ enabled: 'yes', maxInputChars: -5, shortcut: 7 })).toEqual(DEFAULT_CLIENT_SETTINGS)
    expect(decodeClientSettings({ maxInputChars: 4096.9 }).maxInputChars).toBe(4096)
  })
})
