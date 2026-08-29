/**
 * Module-level UI state shared by the slot components and the shortcut
 * listener: one panel state (loading/result/error + its abort controller),
 * one undo stack, and a registry of mounted per-session triggers so the
 * keyboard shortcut can find the composer the user is working in. Every
 * mutation notifies the external-store subscribers the React components
 * read through.
 * @module dsh-prompt-enhance/client/ui-state
 */

import type { EnhanceError, EnhanceResult } from '../shared/protocol'
import { createUndoStack, type UndoStack } from './undo-stack'

/** What the preview panel shows for one enhancement. */
export interface PanelState {
  readonly sessionId: string
  readonly phase: 'loading' | 'result' | 'error'
  /** The draft as it was when the request started (never mutated). */
  readonly original: string
  readonly result?: EnhanceResult
  readonly error?: EnhanceError
  /** Cancels the in-flight request; absent once settled. */
  readonly abort?: () => void
}

/** One mounted composer trigger (the input.right button's session presence). */
export interface SessionEntry {
  /** The button's root element, for focused-composer detection. */
  root: HTMLElement | null
  /** Start one enhancement for this session (guards + fetch + panel). */
  run: () => void
}

const listeners = new Set<() => void>()
let panelState: PanelState | undefined
let version = 0

/** Notify every subscriber (React external store + shortcut bookkeeping). */
function notify(): void {
  version++
  for (const listener of listeners) listener()
}

/** The shared undo store (depth 3 per session). */
const undoStore: UndoStack = createUndoStack(3)

/** Remember one replacement for a session and notify subscribers. */
export function pushUndo(sessionId: string, entry: Parameters<UndoStack['push']>[1]): void {
  undoStore.push(sessionId, entry)
  notify()
}

/** Newest undo entry of a session, when one exists. */
export function peekUndo(sessionId: string): ReturnType<UndoStack['peek']> {
  return undoStore.peek(sessionId)
}

/** Remove the newest undo entry of a session and notify subscribers. */
export function popUndo(sessionId: string): ReturnType<UndoStack['pop']> {
  const entry = undoStore.pop(sessionId)
  notify()
  return entry
}

/** Session registry of mounted triggers; the last mounted session is the shortcut fallback. */
const sessions = new Map<string, SessionEntry>()
let lastMountedSession: string | undefined

/**
 * Subscribe to panel/undo mutations.
 * @param listener - called after every mutation.
 * @returns the unsubscribe function.
 */
export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Current snapshot version (React external store change detector). */
export function getVersion(): number {
  return version
}

/** The panel state, or undefined while closed. */
export function getPanel(): PanelState | undefined {
  return panelState
}

/** Open (or replace) the panel in the loading phase. */
export function openLoading(state: Omit<PanelState, 'phase' | 'result' | 'error'>): void {
  panelState = { ...state, phase: 'loading' }
  notify()
}

/** Settle the open panel with a result. Ignored when the panel moved on. */
export function settleResult(sessionId: string, result: EnhanceResult): void {
  if (panelState?.sessionId !== sessionId || panelState.phase !== 'loading') return
  panelState = { sessionId, phase: 'result', original: panelState.original, result }
  notify()
}

/** Settle the open panel with an error. Ignored when the panel moved on. */
export function settleError(sessionId: string, error: EnhanceError): void {
  if (panelState?.sessionId !== sessionId || panelState.phase !== 'loading') return
  panelState = { sessionId, phase: 'error', original: panelState.original, error }
  notify()
}

/** Open the panel directly in the error phase (local validation failures). */
export function openError(sessionId: string, original: string, error: EnhanceError): void {
  panelState?.abort?.()
  panelState = { sessionId, phase: 'error', original, error }
  notify()
}

/** Close the panel (cancel/dismiss/apply); aborts an in-flight request. */
export function closePanel(): void {
  panelState?.abort?.()
  if (panelState === undefined) return
  panelState = undefined
  notify()
}

/**
 * Register one session's mounted trigger; returns the unregister function.
 * The most recent registration becomes the shortcut's fallback target.
 */
export function registerSession(sessionId: string, entry: SessionEntry): () => void {
  sessions.set(sessionId, entry)
  lastMountedSession = sessionId
  notify()
  return () => {
    if (sessions.get(sessionId) === entry) sessions.delete(sessionId)
    if (lastMountedSession === sessionId) lastMountedSession = undefined
    if (panelState?.sessionId === sessionId) closePanel()
    undoStore.clear(sessionId)
  }
}

/**
 * Pick the session the shortcut should act on: the composer containing the
 * focused element when identifiable (the lowest ancestor of the focus that
 * also contains a registered button, within the composer card's depth),
 * otherwise the most recently mounted one. Returns the entry's run callback.
 */
export function shortcutTarget(): (() => void) | undefined {
  const active = document.activeElement
  if (active !== null && active instanceof Element) {
    let node: Element | null = active
    // The composer card sits within a handful of levels above the textarea;
    // stopping here keeps a settings-page focus from matching via <body>.
    for (let depth = 0; depth < 8 && node !== null; depth++) {
      for (const entry of sessions.values()) {
        if (entry.root !== null && (node === entry.root || node.contains(entry.root))) {
          const found = entry
          return () => found.run()
        }
      }
      node = node.parentElement
    }
  }
  const fallback = lastMountedSession !== undefined ? sessions.get(lastMountedSession) : undefined
  return fallback === undefined ? undefined : () => fallback.run()
}
