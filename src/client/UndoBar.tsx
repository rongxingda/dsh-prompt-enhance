/**
 * The undo bar (conversation.input.dock): after an enhanced result was
 * applied, one quiet row above the composer card offers a single-click
 * restore of the original draft. It hides itself once the draft diverges
 * from the applied text (the user kept typing) — the entry is dropped, so
 * the bar can never restore stale text over newer edits.
 * @module dsh-prompt-enhance/client/UndoBar
 */

import { useEffect, type ReactNode } from 'react'
import { useSyncExternalStore } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import * as ui from './ui-state'

/** Props of the input.dock entry: the InputZone owner share + session kit + locale seat. */
export type UndoBarProps = PropsRuntime<'conversation.input.dock'> & PropsLocale<'prompt-enhance'>

/** One session's undo affordance. */
export function UndoBar(props: UndoBarProps): ReactNode {
  const { t, sessionId, useInput, inputActions } = props
  const draft = useInput((state) => state.draft)
  useSyncExternalStore(ui.subscribe, ui.getVersion)
  const entry = ui.peekUndo(sessionId)

  // The draft moved on (user edited after applying): drop the stale entry.
  useEffect(() => {
    if (entry !== undefined && entry.applied !== draft) ui.popUndo(sessionId)
  }, [draft, entry, sessionId])

  if (entry === undefined || entry.applied !== draft) return null

  const undo = (): void => {
    inputActions.setDraft(entry.original)
    ui.popUndo(sessionId)
  }
  const dismiss = (): void => {
    ui.popUndo(sessionId)
  }

  return (
    <div className="dsh-pe-undo">
      <span className="dsh-pe-undo-check" aria-hidden>✓</span>
      <span>{t('undo.applied')}</span>
      <button type="button" className="dsh-pe-undo-link" onClick={undo}>{t('undo.undo')}</button>
      <button type="button" className="dsh-pe-undo-x" aria-label={t('undo.dismiss')} onClick={dismiss}>✕</button>
    </div>
  )
}
