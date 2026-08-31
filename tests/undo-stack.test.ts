import { describe, expect, it } from 'vitest'
import { createUndoStack } from '../src/client/undo-stack'

describe('createUndoStack', () => {
  it('pushes and peeks the newest entry', () => {
    const stack = createUndoStack()
    stack.push('s1', { original: '一', applied: 'A' })
    stack.push('s1', { original: 'A', applied: 'B' })
    expect(stack.peek('s1')).toEqual({ original: 'A', applied: 'B' })
    expect(stack.depth('s1')).toBe(2)
  })

  it('pops in LIFO order', () => {
    const stack = createUndoStack()
    stack.push('s1', { original: '一', applied: 'A' })
    stack.push('s1', { original: 'A', applied: 'B' })
    expect(stack.pop('s1')).toEqual({ original: 'A', applied: 'B' })
    expect(stack.pop('s1')).toEqual({ original: '一', applied: 'A' })
    expect(stack.pop('s1')).toBeUndefined()
  })

  it('drops the oldest entries beyond the depth cap', () => {
    const stack = createUndoStack(2)
    stack.push('s1', { original: '0', applied: '1' })
    stack.push('s1', { original: '1', applied: '2' })
    stack.push('s1', { original: '2', applied: '3' })
    expect(stack.depth('s1')).toBe(2)
    expect(stack.pop('s1')).toEqual({ original: '2', applied: '3' })
    expect(stack.pop('s1')).toEqual({ original: '1', applied: '2' })
  })

  it('keeps sessions independent and clearable', () => {
    const stack = createUndoStack()
    stack.push('s1', { original: '一', applied: 'A' })
    stack.push('s2', { original: '二', applied: 'B' })
    expect(stack.depth('s1')).toBe(1)
    stack.clear('s1')
    expect(stack.depth('s1')).toBe(0)
    expect(stack.peek('s2')).toEqual({ original: '二', applied: 'B' })
  })

  it('evicts the least-recently-written session beyond the global cap', () => {
    // Per-session depth 3, global cap 4: pushing a fifth entry must drop the
    // session that has not been written to the longest, not the newest.
    const stack = createUndoStack(3, 4)
    stack.push('s1', { original: '0', applied: '1' })
    stack.push('s2', { original: '一', applied: 'A' })
    stack.push('s1', { original: '1', applied: '2' }) // s1 written again → newest
    stack.push('s3', { original: '二', applied: 'B' })
    stack.push('s4', { original: '三', applied: 'C' }) // total 5 > 4 → evict s2
    expect(stack.depth('s2')).toBe(0)
    expect(stack.depth('s1')).toBe(2)
    expect(stack.depth('s3')).toBe(1)
    expect(stack.depth('s4')).toBe(1)
  })

  it('evicts the whole stack of the least-recently-written session', () => {
    // Global cap 3: pushing a fourth entry evicts the session whose LAST write
    // is the oldest (s1 was last written before s2/s3 existed) — its entire
    // stack goes, not just one entry.
    const stack = createUndoStack(3, 3)
    stack.push('s1', { original: '0', applied: '1' })
    stack.push('s1', { original: '1', applied: '2' })
    stack.push('s2', { original: '一', applied: 'A' })
    stack.push('s3', { original: '二', applied: 'B' }) // total 4 > 3 → evict s1
    expect(stack.depth('s1')).toBe(0)
    expect(stack.depth('s2')).toBe(1)
    expect(stack.depth('s3')).toBe(1)
  })

  it('is silent on unknown sessions', () => {
    const stack = createUndoStack()
    expect(stack.peek('missing')).toBeUndefined()
    expect(stack.pop('missing')).toBeUndefined()
    expect(stack.depth('missing')).toBe(0)
    expect(() => stack.clear('missing')).not.toThrow()
  })
})
