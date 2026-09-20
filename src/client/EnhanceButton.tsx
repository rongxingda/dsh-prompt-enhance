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
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { EnhanceError } from '../shared/protocol'
import { checkInputText } from '../shared/validate'
import { EnhanceClientError, requestEnhance, requestEnhanceStream } from './enhance-client'
import { ResultPanel } from './ResultPanel'
import * as ui from './ui-state'
import { getClientSettings, subscribeClientSettings } from './settings'
import { useSessionKey, serverSessionId } from './session-key'

/** Props of the input.right entry: the InputZone owner share + session kit + locale seat. */
export type EnhanceButtonProps = PropsRuntime<'conversation.input.right'> & PropsLocale<'prompt-enhance'>

/** Input fields renamed across DSH client releases; slot props can also be partial during upgrades. */
type CompatibleInputState = {
  occurrences?: readonly unknown[]
  attachmentIds?: readonly unknown[]
  imageIds?: readonly unknown[]
}

/** One composer's enhance trigger. */
export function EnhanceButton(props: EnhanceButtonProps): ReactNode {
  const { t, sessionId, useInput, inputActions } = props
  // 0.1.1-rc.2 carries sessionId on the props; 0.1.2-rc.1 dropped it. Use the
  // host id for UI keying when present, else a stable per-mount fallback.
  const uiKey = useSessionKey(sessionId, inputActions)
  const wireId = serverSessionId(sessionId)
  const draft = useInput((state) => state.draft)
  const phase = useInput((state) => state.phase)
  const occurrenceCount = useInput((state) => (state as CompatibleInputState).occurrences?.length ?? 0)
  const imageCount = useInput((state) => {
    const compatible = state as CompatibleInputState
    return compatible.attachmentIds?.length ?? compatible.imageIds?.length ?? 0
  })
  const settings = useSyncExternalStore(subscribeClientSettings, getClientSettings)
  const panel = useSyncExternalStore(ui.subscribe, ui.getPanel)
  const rootRef = useRef<HTMLButtonElement | null>(null)
  const busy = panel !== undefined && panel.sessionId === uiKey && panel.phase === 'loading'
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
      ui.openError(uiKey, draft, { code: 'rejected', message: t('error.disabled'), localized: t('error.disabled') })
      return
    }
    if (imageCount > 0 && draft.trim() === '') {
      ui.openError(uiKey, draft, { code: 'rejected', message: t('error.imagesOnly'), localized: t('error.imagesOnly') })
      return
    }
    const check = checkInputText(draft, settings.maxInputChars)
    if (!check.ok) {
      const message = check.code === 'empty'
        ? t('error.empty')
        : t('error.tooLong', { count: check.count, max: check.max })
      ui.openError(uiKey, draft, { code: 'rejected', message, localized: message })
      return
    }
    if (occurrenceCount > 0) {
      ui.openError(uiKey, draft, { code: 'rejected', message: t('error.occurrences'), localized: t('error.occurrences') })
      return
    }
    if (phase !== 'plain') {
      ui.openError(uiKey, draft, { code: 'rejected', message: t('error.phase'), localized: t('error.phase') })
      return
    }
    const controller = new AbortController()
    ui.openLoading({ sessionId: uiKey, original: draft, abort: () => controller.abort() })
    const settle = (result: Parameters<typeof ui.settleResult>[1]): void => ui.settleResult(uiKey, result)
    const fail = (error: unknown): void => {
      const detail: EnhanceError = error instanceof EnhanceClientError
        ? error.detail
        : { code: 'internal', message: error instanceof Error ? error.message : String(error) }
      ui.settleError(uiKey, detail)
    }
    // Progressive display when enabled: the panel fills in as the model
    // writes, and degrades to the one-shot call on its own when the host or
    // the transport cannot stream.
    if (settings.streaming) {
      requestEnhanceStream({ sessionId: wireId, text: draft }, {
        signal: controller.signal,
        onDelta: (delta: string): void => ui.appendDelta(uiKey, delta),
      }).then(settle, fail)
      return
    }
    requestEnhance({ sessionId: wireId, text: draft }, controller.signal).then(settle, fail)
  }, [anyBusy, draft, imageCount, occurrenceCount, phase, settings, uiKey, wireId, t])

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
    return ui.registerSession(uiKey, entry)
  }, [uiKey])

  // Draft changed after the request started → flag (or clear) the result
  // panel's stale marker so the user knows the result is based on the
  // pre-enhance text.
  useEffect(() => {
    if (panel !== undefined && panel.sessionId === uiKey && panel.phase === 'result') {
      ui.setStale(uiKey, draft !== panel.original)
    }
  }, [draft, panel, uiKey])

  /** Apply the enhanced result: remember the CURRENT draft (pre-apply, so
   * undo restores exactly this state even if the user typed during the
   * request), then fill the enhanced text back. */
  const apply = useCallback((): void => {
    if (panel === undefined || panel.phase !== 'result' || panel.result === undefined) return
    ui.pushUndo(uiKey, { original: draft, applied: panel.result.text })
    inputActions.setDraft(panel.result.text)
    ui.closePanel()
  }, [draft, inputActions, panel, uiKey])

  if (!settings.enabled) return null

  const owned = panel !== undefined && panel.sessionId === uiKey ? panel : undefined
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
