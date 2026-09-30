/**
 * Locale-dictionary integrity, including the regression lock for the wire
 * `reason` → dictionary-key mapping the preview panel uses.
 *
 * The bug this file exists for: `params.reason` arrives kebab-case
 * (`invalid-credential`, `rate-limit`, `context-window`, `tool-call`,
 * `max-tokens`) while the dictionary keys are camelCase
 * (`error.upstream.invalidCredential`, …). Composing the key as
 * `` `error.upstream.${reason}` `` therefore missed five of the eight reasons
 * and silently rendered the generic `error.upstream` line, even though the
 * specific copy was already shipped. The mapping is now an explicit table
 * (`UPSTREAM_ERROR_KEYS`); these assertions fail if a key is ever added to the
 * table without shipped copy, or the tables drift apart again.
 * @module tests/locales
 */

import { describe, expect, it } from 'vitest'
import { en, zh, type PromptEnhanceKey } from '../src/client/locales'
import { UPSTREAM_ERROR_KEYS } from '../src/client/ResultPanel'

/** Every wire reason `UpstreamReason` declares (src/enhancer.ts). */
const WIRE_REASONS = [
  'auth',
  'invalid-credential',
  'rate-limit',
  'quota',
  'empty',
  'context-window',
  'tool-call',
  'max-tokens',
] as const

describe('locale dictionaries', () => {
  it('ships the same key set in zh and en', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort())
  })

  it('has non-empty copy for every key in both dictionaries', () => {
    for (const key of Object.keys(zh) as PromptEnhanceKey[]) {
      expect(String(zh[key]).trim(), `zh['${key}']`).not.toBe('')
      expect(String(en[key]).trim(), `en['${key}']`).not.toBe('')
    }
  })
})

describe('UPSTREAM_ERROR_KEYS (wire reason → dictionary key)', () => {
  it('maps every wire reason the host can send', () => {
    for (const reason of WIRE_REASONS) {
      expect(UPSTREAM_ERROR_KEYS[reason], `missing mapping for '${reason}'`).toBeDefined()
    }
    // No extra entries: the table must not grow beyond the wire vocabulary
    // without the host side gaining the same reason.
    expect(Object.keys(UPSTREAM_ERROR_KEYS).sort()).toEqual([...WIRE_REASONS].sort())
  })

  it('points every entry at copy that actually exists in both dictionaries', () => {
    for (const [reason, key] of Object.entries(UPSTREAM_ERROR_KEYS)) {
      expect(zh[key], `zh is missing '${key}' (reason '${reason}')`).toBeTruthy()
      expect(en[key], `en is missing '${key}' (reason '${reason}')`).toBeTruthy()
    }
  })

  it('keeps the wire vocabulary distinct — no reason may alias another', () => {
    expect(new Set(Object.values(UPSTREAM_ERROR_KEYS)).size).toBe(Object.keys(UPSTREAM_ERROR_KEYS).length)
  })
})
