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

  it('is silent on unknown sessions', () => {
    const stack = createUndoStack()
    expect(stack.peek('missing')).toBeUndefined()
    expect(stack.pop('missing')).toBeUndefined()
    expect(stack.depth('missing')).toBe(0)
    expect(() => stack.clear('missing')).not.toThrow()
  })
})
