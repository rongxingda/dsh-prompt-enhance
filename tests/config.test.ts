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
})

describe('effectiveSystemPrompt', () => {
  it('uses the built-in strategy when the override is blank', () => {
    expect(effectiveSystemPrompt({ ...DEFAULT_CONFIG, systemPrompt: '' }, DEFAULT_SYSTEM_PROMPT)).toBe(DEFAULT_SYSTEM_PROMPT)
    expect(effectiveSystemPrompt({ ...DEFAULT_CONFIG, systemPrompt: '  \n' }, DEFAULT_SYSTEM_PROMPT)).toBe(DEFAULT_SYSTEM_PROMPT)
  })

  it('uses the configured override verbatim', () => {
    expect(effectiveSystemPrompt({ ...DEFAULT_CONFIG, systemPrompt: 'You are terse.' }, DEFAULT_SYSTEM_PROMPT)).toBe('You are terse.')
  })
})
