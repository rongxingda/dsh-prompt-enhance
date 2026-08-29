/**
 * Per-session undo stack: remembers the original draft replaced by each
 * applied enhancement so one click restores it. Pure factory — the client
 * half owns one module-level instance; tests own their own.
 * @module dsh-prompt-enhance/client/undo-stack
 */

/** One rememberable replacement. */
export interface UndoEntry {
  /** The draft as it was before the enhanced text replaced it. */
  readonly original: string
  /** The enhanced text that was applied (identifies when the entry is stale). */
  readonly applied: string
}

/** Mutable undo store over a session-keyed map of depth-limited stacks. */
export interface UndoStack {
  /** Push one entry for a session; the oldest beyond depth is dropped. */
  push(sessionId: string, entry: UndoEntry): void
  /** Newest entry of a session, when one exists. */
  peek(sessionId: string): UndoEntry | undefined
  /** Remove and return the newest entry of a session. */
  pop(sessionId: string): UndoEntry | undefined
  /** Drop every entry of one session (session teardown / dismiss). */
  clear(sessionId: string): void
  /** Current depth of one session's stack (diagnostics/tests). */
  depth(sessionId: string): number
}

/**
 * Create one undo stack.
 * @param maxDepth - entries remembered per session (default 3).
 * @returns the store.
 */
export function createUndoStack(maxDepth = 3): UndoStack {
  const stacks = new Map<string, UndoEntry[]>()
  return {
    push(sessionId, entry) {
      const stack = stacks.get(sessionId) ?? []
      stack.push(entry)
      while (stack.length > maxDepth) stack.shift()
      stacks.set(sessionId, stack)
    },
    peek(sessionId) {
      const stack = stacks.get(sessionId)
      return stack === undefined || stack.length === 0 ? undefined : stack[stack.length - 1]
    },
    pop(sessionId) {
      const stack = stacks.get(sessionId)
      const entry = stack?.pop()
      if (stack !== undefined && stack.length === 0) stacks.delete(sessionId)
      return entry
    },
    clear(sessionId) {
      stacks.delete(sessionId)
    },
    depth(sessionId) {
      return stacks.get(sessionId)?.length ?? 0
    },
  }
}
