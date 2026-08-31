/**
 * The composer enhance button (conversation.input.right): reads the live
 * draft through the session standard kit, applies every local guard
 * (empty / over-length / images-only / command-or-reference chips / busy),
 * then calls the host route and shows the preview panel. Applying the
 * result remembers the original on the undo stack before setDraft, so one
 * click restores it. The button never blocks the composer: on any failure
 * the draft stays exactly as the user typed it.
 * @module dsh-prompt-enhance/client/EnhanceButton
 */

import { useCallback, useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { EnhanceError } from '../shared/protocol'
import { checkInputText } from '../shared/validate'
import { EnhanceClientError, requestEnhance } from './enhance-client'
import { ResultPanel } from './ResultPanel'
import * as ui from './ui-state'
import { getClientSettings, subscribeClientSettings } from './settings'

/** Props of the input.right entry: the InputZone owner share + session kit + locale seat. */
export type EnhanceButtonProps = PropsRuntime<'conversation.input.right'> & PropsLocale<'prompt-enhance'>

/** One composer's enhance trigger. */
export function EnhanceButton(props: EnhanceButtonProps): ReactNode {
  const { t, sessionId, useInput, inputActions } = props
  const draft = useInput((state) => state.draft)
  const phase = useInput((state) => state.phase)
  const occurrenceCount = useInput((state) => state.occurrences.length)
  const imageCount = useInput((state) => state.imageIds.length)
  const settings = useSyncExternalStore(subscribeClientSettings, getClientSettings)
  const panel = useSyncExternalStore(ui.subscribe, ui.getPanel)
  const rootRef = useRef<HTMLButtonElement | null>(null)
  const busy = panel !== undefined && panel.sessionId === sessionId && panel.phase === 'loading'
  // The preview panel is a single shared slot, so the UI admits exactly ONE
  // in-flight enhancement at a time across all sessions: `anyBusy` disables
  // every other composer's button while one request is loading. This is
  // deliberately stricter than the host `maxConcurrent` cap (default 2) —
  // that cap protects the /enhance command plane and multi-client callers,
  // while the single-panel UI cannot show two loading states anyway.
  const anyBusy = panel !== undefined && panel.phase === 'loading'

  /** Guard chain + fetch + panel transition for this session. */
  const start = useCallback((): void => {
    if (anyBusy) return
    if (!settings.enabled) {
      ui.openError(sessionId, draft, { code: 'rejected', message: t('error.disabled'), localized: t('error.disabled') })
      return
    }
    if (imageCount > 0 && draft.trim() === '') {
      ui.openError(sessionId, draft, { code: 'rejected', message: t('error.imagesOnly'), localized: t('error.imagesOnly') })
      return
    }
    const check = checkInputText(draft, settings.maxInputChars)
    if (!check.ok) {
      const message = check.code === 'empty'
        ? t('error.empty')
        : t('error.tooLong', { count: check.count, max: check.max })
      ui.openError(sessionId, draft, { code: 'rejected', message, localized: message })
      return
    }
    if (occurrenceCount > 0) {
      ui.openError(sessionId, draft, { code: 'rejected', message: t('error.occurrences'), localized: t('error.occurrences') })
      return
    }
    if (phase !== 'plain') {
      ui.openError(sessionId, draft, { code: 'rejected', message: t('error.phase'), localized: t('error.phase') })
      return
    }
    const controller = new AbortController()
    ui.openLoading({ sessionId, original: draft, abort: () => controller.abort() })
    requestEnhance({ sessionId, text: draft }, controller.signal).then(
      (result) => ui.settleResult(sessionId, result),
      (error: unknown) => {
        const detail: EnhanceError = error instanceof EnhanceClientError
          ? error.detail
          : { code: 'internal', message: error instanceof Error ? error.message : String(error) }
        ui.settleError(sessionId, detail)
      },
    )
  }, [anyBusy, draft, imageCount, occurrenceCount, phase, sessionId, settings, t])

  // The session registry holds a stable identity; run always dispatches to
  // the latest start callback. The refresh rides an effect (never the render
  // phase, which is unsafe under React 18 concurrent rendering).
  const runRef = useRef(start)
  useEffect(() => {
    runRef.current = start
  })
  useEffect(() => {
    const entry: ui.SessionEntry = {
      root: rootRef.current,
      run: () => runRef.current(),
    }
    return ui.registerSession(sessionId, entry)
  }, [sessionId])

  // Draft changed after the request started → flag (or clear) the result
  // panel's stale marker so the user knows the result is based on the
  // pre-enhance text.
  useEffect(() => {
    if (panel !== undefined && panel.sessionId === sessionId && panel.phase === 'result') {
      ui.setStale(sessionId, draft !== panel.original)
    }
  }, [draft, panel, sessionId])

  /** Apply the enhanced result: remember the CURRENT draft (pre-apply, so
   * undo restores exactly this state even if the user typed during the
   * request), then fill the enhanced text back. */
  const apply = useCallback((): void => {
    if (panel === undefined || panel.phase !== 'result' || panel.result === undefined) return
    ui.pushUndo(sessionId, { original: draft, applied: panel.result.text })
    inputActions.setDraft(panel.result.text)
    ui.closePanel()
  }, [draft, inputActions, panel, sessionId])

  if (!settings.enabled) return null

  const owned = panel !== undefined && panel.sessionId === sessionId ? panel : undefined
  return (
    <>
      <button
        ref={rootRef}
        type="button"
        className={`dsh-pe-btn${busy ? ' is-busy' : ''}`}
        title={busy ? t('button.busy') : t('button.title')}
        aria-label={t('button.title')}
        disabled={anyBusy && !busy}
        onClick={start}
      >
        <span className="dsh-pe-btn-icon" aria-hidden>{busy ? '◌' : '✨'}</span>
      </button>
      {owned !== undefined && (
        createPortal(
          <ResultPanel
            state={owned}
            t={t}
            onApply={apply}
            onCancel={() => ui.closePanel()}
            onRetry={owned.phase === 'error' ? start : undefined}
          />,
          document.body,
        )
      )}
    </>
  )
}
