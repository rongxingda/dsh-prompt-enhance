import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, effectiveSystemPrompt, resolveConfig } from '../src/config'
import { DEFAULT_SYSTEM_PROMPT } from '../src/prompts'

describe('resolveConfig', () => {
  it('passes a paired provider/model override', () => {
    const resolved = resolveConfig({ ...DEFAULT_CONFIG, provider: 'zhipu', model: 'glm-5.3' })
    expect(resolved.provider).toBe('zhipu')
    expect(resolved.model).toBe('glm-5.3')
  })

  it('passes an empty pair (session-follow mode)', () => {
    expect(() => resolveConfig({ ...DEFAULT_CONFIG })).not.toThrow()
  })

  it('rejects a half-filled pair', () => {
    expect(() => resolveConfig({ ...DEFAULT_CONFIG, provider: 'zhipu' })).toThrow(/成对/)
    expect(() => resolveConfig({ ...DEFAULT_CONFIG, model: 'glm-5.3' })).toThrow(/成对/)
  })

  it('rejects blank strings in the pair', () => {
    expect(() => resolveConfig({ ...DEFAULT_CONFIG, provider: ' ', model: 'glm' })).toThrow(/非空/)
  })

  it('runs deep runtime validation', () => {
    expect(() => resolveConfig({ ...DEFAULT_CONFIG, temperature: Number.NaN })).toThrow(/temperature/)
    expect(() => resolveConfig({ ...DEFAULT_CONFIG, maxInputChars: 4096.9 })).toThrow(/maxInputChars/)
    expect(() => resolveConfig({ ...DEFAULT_CONFIG, timeoutMs: -1 })).toThrow(/timeoutMs/)
    expect(() => resolveConfig({ ...DEFAULT_CONFIG, enabled: 'yes' as never })).toThrow(/enabled/)
  })

  it('stores provider/model trimmed', () => {
    const resolved = resolveConfig({ ...DEFAULT_CONFIG, provider: ' zhipu ', model: ' glm ' })
    expect(resolved.provider).toBe('zhipu')
    expect(resolved.model).toBe('glm')
  })

  it('defaults an absent or malformed strategyMode to replace-default', () => {
    expect(resolveConfig({ ...DEFAULT_CONFIG }).strategyMode).toBe('replace-default')
    expect(resolveConfig({ ...DEFAULT_CONFIG, strategyMode: 'bogus' as never }).strategyMode).toBe('replace-default')
  })

  it('keeps an explicit extend-default', () => {
    expect(resolveConfig({ ...DEFAULT_CONFIG, strategyMode: 'extend-default' }).strategyMode).toBe('extend-default')
  })

  it('strips unknown keys left over from older versions', () => {
    const legacy = { ...DEFAULT_CONFIG, legacySetting: 'old-value' } as typeof DEFAULT_CONFIG & Record<string, unknown>
    const resolved = resolveConfig(legacy)
    expect(resolved).not.toHaveProperty('legacySetting')
    expect(resolved.enabled).toBe(DEFAULT_CONFIG.enabled)
    expect(Object.keys(resolved).sort()).toEqual([
      'enabled', 'maxConcurrent', 'maxInputChars', 'maxOutputTokens', 'model',
      'provider', 'rateLimitPerMinute',
      'shortcut', 'strategyMode', 'systemPrompt', 'temperature', 'timeoutMs',
    ])
  })
})

describe('effectiveSystemPrompt', () => {
  it('uses the built-in strategy when the override is blank', () => {
    expect(effectiveSystemPrompt({ ...DEFAULT_CONFIG, systemPrompt: '' }, DEFAULT_SYSTEM_PROMPT)).toBe(DEFAULT_SYSTEM_PROMPT)
    expect(effectiveSystemPrompt({ ...DEFAULT_CONFIG, systemPrompt: '  \n' }, DEFAULT_SYSTEM_PROMPT)).toBe(DEFAULT_SYSTEM_PROMPT)
  })

  it('uses the configured override verbatim in the default (replace) mode', () => {
    expect(effectiveSystemPrompt({ ...DEFAULT_CONFIG, systemPrompt: 'You are terse.' }, DEFAULT_SYSTEM_PROMPT)).toBe('You are terse.')
  })

  it('appends the override after the built-in strategy in extend mode', () => {
    const prompt = effectiveSystemPrompt({ ...DEFAULT_CONFIG, systemPrompt: 'Always answer in bullet points.', strategyMode: 'extend-default' }, DEFAULT_SYSTEM_PROMPT)
    expect(prompt.startsWith(DEFAULT_SYSTEM_PROMPT)).toBe(true)
    expect(prompt).toContain('Always answer in bullet points.')
  })

  it('falls back to the built-in strategy when the override is blank in either mode', () => {
    expect(effectiveSystemPrompt({ ...DEFAULT_CONFIG, strategyMode: 'extend-default' }, DEFAULT_SYSTEM_PROMPT)).toBe(DEFAULT_SYSTEM_PROMPT)
  })
})
