import { describe, expect, it } from 'vitest'
import { normalizeOutput } from '../src/shared/normalize'

describe('normalizeOutput', () => {
  it('trims surrounding whitespace', () => {
    expect(normalizeOutput('  你好\n')).toBe('你好')
  })

  it('strips one wrapping code fence with a language tag', () => {
    expect(normalizeOutput('```markdown\n# 标题\n正文\n```')).toBe('# 标题\n正文')
  })

  it('strips a bare wrapping fence', () => {
    expect(normalizeOutput('```\n角色：翻译\n```')).toBe('角色：翻译')
  })

  it('keeps fences that are part of the body', () => {
    const body = '输出示例：\n```\ncode\n```\n结束'
    expect(normalizeOutput(body)).toBe(body)
  })

  it('keeps multiple fenced blocks intact instead of stripping the outer pair', () => {
    const body = '```\n第一块\n```\n```\n第二块\n```'
    expect(normalizeOutput(body)).toBe(body)
  })

  it('collapses three or more blank lines into one', () => {
    expect(normalizeOutput('一\n\n\n\n二')).toBe('一\n\n二')
  })

  it('returns empty string for whitespace-only or fence-only output', () => {
    expect(normalizeOutput('   ')).toBe('')
    expect(normalizeOutput('```\n```')).toBe('')
  })
})
