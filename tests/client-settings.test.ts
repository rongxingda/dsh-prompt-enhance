import { describe, expect, it } from 'vitest'
import { decodeClientSettings, DEFAULT_CLIENT_SETTINGS } from '../src/client/settings'
import { DEFAULT_CONFIG } from '../src/config'

describe('decodeClientSettings', () => {
  it('mirrors the host defaults field by field', () => {
    // The compile-time `AssertMirror` in settings.ts only proves the KEY SET
    // matches. A changed host default would otherwise drift in silence: the
    // settings page shows one number while the composer guards against another.
    expect(DEFAULT_CLIENT_SETTINGS).toEqual({
      enabled: DEFAULT_CONFIG.enabled,
      maxInputChars: DEFAULT_CONFIG.maxInputChars,
      shortcut: DEFAULT_CONFIG.shortcut,
      streaming: DEFAULT_CONFIG.streaming,
    })
  })

  it('returns defaults for a missing or malformed section', () => {
    expect(decodeClientSettings(undefined)).toEqual(DEFAULT_CLIENT_SETTINGS)
    expect(decodeClientSettings(null)).toEqual(DEFAULT_CLIENT_SETTINGS)
    expect(decodeClientSettings('nope')).toEqual(DEFAULT_CLIENT_SETTINGS)
  })

  it('reads well-formed fields', () => {
    expect(
      decodeClientSettings({ enabled: false, maxInputChars: 8000, shortcut: 'ctrl+shift+e', streaming: false }),
    ).toEqual({ enabled: false, maxInputChars: 8000, shortcut: 'ctrl+shift+e', streaming: false })
  })

  it('falls back field-by-field on bad values', () => {
    expect(decodeClientSettings({ enabled: 'yes', maxInputChars: -5, shortcut: 7, streaming: 'no' })).toEqual(DEFAULT_CLIENT_SETTINGS)
    expect(decodeClientSettings({ maxInputChars: 4096.9 }).maxInputChars).toBe(4096)
  })

  it('keeps streaming on by default and off only when explicitly false', () => {
    expect(decodeClientSettings({}).streaming).toBe(true)
    expect(decodeClientSettings({ streaming: false }).streaming).toBe(false)
  })
})
