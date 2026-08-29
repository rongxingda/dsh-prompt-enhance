import { describe, expect, it } from 'vitest'
import { checkInputText, formatInputCheckZh } from '../src/shared/validate'

describe('checkInputText', () => {
  it('accepts normal text', () => {
    expect(checkInputText('帮我写一个爬虫', 100)).toEqual({ ok: true })
  })

  it('rejects empty and whitespace-only text', () => {
    expect(checkInputText('', 100)).toEqual({ ok: false, code: 'empty' })
    expect(checkInputText('   \n\t ', 100)).toEqual({ ok: false, code: 'empty' })
  })

  it('treats invisible characters as empty', () => {
    expect(checkInputText('\u200B\uFEFF\u200C', 100)).toEqual({ ok: false, code: 'empty' })
  })

  it('rejects over-length text with the exact counts', () => {
    const text = 'a'.repeat(11)
    expect(checkInputText(text, 10)).toEqual({ ok: false, code: 'too-long', count: 11, max: 10 })
  })

  it('accepts text exactly at the cap', () => {
    expect(checkInputText('a'.repeat(10), 10)).toEqual({ ok: true })
  })
})

describe('formatInputCheckZh', () => {
  it('renders the empty message', () => {
    expect(formatInputCheckZh({ ok: false, code: 'empty' })).toContain('输入框为空')
  })

  it('renders counts in the too-long message', () => {
    const message = formatInputCheckZh({ ok: false, code: 'too-long', count: 12345, max: 12000 })
    expect(message).toContain('12345')
    expect(message).toContain('12000')
  })

  it('renders nothing for a passing check', () => {
    expect(formatInputCheckZh({ ok: true })).toBe('')
  })
})
