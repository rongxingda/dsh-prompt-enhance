/**
 * The preview panel: a fixed overlay comparing the original draft with the
 * enhanced result, with 回填 / 复制 / 取消 in the result phase, a cancellable
 * spinner in the loading phase, and a retryable error message otherwise.
 * Rendered through a portal into document.body by the button component.
 * @module dsh-prompt-enhance/client/ResultPanel
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { EnhanceError } from '../shared/protocol'
import type { PromptEnhanceKey } from './locales'
import type { PanelState } from './ui-state'

/** Props of the preview panel. */
export interface ResultPanelProps {
  state: PanelState
  t: TranslateNS<'prompt-enhance'>
  /** Fill the enhanced text back into the composer (the button owns setDraft). */
  onApply: () => void
  /** Close without touching the composer (also aborts an in-flight call). */
  onCancel: () => void
  /** Retry after a retryable error; undefined in non-error phases. */
  onRetry?: () => void
}

/** Whether one error phase is worth retrying (model/transport failures). */
const retryable = (code: string | undefined): boolean => code === 'upstream' || code === 'timeout' || code === 'internal'

/**
 * Wire `reason` (`UpstreamReason`, kebab-case as the host sends it) → the
 * dictionary key that carries its fix hint.
 *
 * This is an EXPLICIT table on purpose. The dictionary keys are camelCase
 * (`error.upstream.invalidCredential`) while the wire reasons are kebab-case
 * (`invalid-credential`), so building the key as
 * `` `error.upstream.${reason}` `` silently missed every multi-word reason
 * (`invalid-credential`, `rate-limit`, `context-window`, `tool-call`,
 * `max-tokens` — five of the eight) and always fell back to the generic
 * `error.upstream` copy. Spelling the mapping out keeps the two vocabularies
 * in one place: every entry is a literal key checked by `PromptEnhanceKey`,
 * and `tests/locales.test.ts` asserts each one exists in every dictionary.
 */
export const UPSTREAM_ERROR_KEYS: Record<string, PromptEnhanceKey> = {
  auth: 'error.upstream.auth',
  'invalid-credential': 'error.upstream.invalidCredential',
  'rate-limit': 'error.upstream.rateLimit',
  quota: 'error.upstream.quota',
  empty: 'error.upstream.empty',
  'context-window': 'error.upstream.contextWindow',
  'tool-call': 'error.upstream.toolCall',
  'max-tokens': 'error.upstream.maxTokens',
}

/**
 * Primary line for a server-side error, localized by the stable code and its
 * structured params: an upstream `reason` picks a specific fix hint when one
 * exists, and an over-length rejection reuses the too-long input message the
 * client-side guard shows. The server's `message` (provider raw text, config
 * errors) renders beneath as the diagnostic detail line.
 */
function localizedErrorMessage(
  t: ResultPanelProps['t'],
  code: EnhanceError['code'],
  params: EnhanceError['params'],
): string {
  if (code === 'rejected' && typeof params?.count === 'number' && typeof params?.max === 'number') {
    return t('error.tooLong', { count: params.count, max: params.max })
  }
  if (code === 'upstream' && typeof params?.reason === 'string') {
    const specific = UPSTREAM_ERROR_KEYS[params.reason]
    if (specific !== undefined) return t(specific)
  }
  switch (code) {
    case 'rejected': return t('error.rejected')
    case 'rate-limit': return t('error.rateLimit', params)
    case 'concurrency-limit': return t('error.concurrencyLimit', params)
    case 'timeout': return t('error.timeout', params)
    case 'unconfigured': return t('error.unconfigured')
    case 'upstream': return t('error.upstream')
    default: return t('error.internal')
  }
}

/**
 * Clipboard fallback for insecure contexts (LAN http), where
 * `navigator.clipboard` is undefined: a transient textarea plus the legacy
 * `execCommand('copy')`.
 */
function fallbackCopy(text: string): boolean {
  try {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    const ok = document.execCommand('copy')
    textarea.remove()
    return ok
  } catch {
    return false
  }
}

/** One enhancement preview overlay. */
export function ResultPanel(props: ResultPanelProps): ReactNode {
  const { state, t, onApply, onCancel, onRetry } = props
  const [copied, setCopied] = useState<'idle' | 'ok' | 'failed'>('idle')
  const panelRef = useRef<HTMLElement | null>(null)

  // Keyboard handling: Escape closes (cancels) the panel — except during IME
  // composition, where Esc cancels candidate input — and Tab cycles inside
  // the dialog so focus cannot escape to the page beneath.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.isComposing) return
      if (event.key === 'Escape' && !event.defaultPrevented) {
        event.preventDefault()
        onCancel()
        return
      }
      if (event.key === 'Tab') {
        const panel = panelRef.current
        if (panel === null) return
        const focusables = panel.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input, [tabindex]:not([tabindex="-1"])')
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        if (first === undefined || last === undefined) return
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  // The element that owned focus when the panel opened, captured at mount.
  const openerRef = useRef<HTMLElement | null>(null)

  // Move focus into the dialog on open. The restore lives in the SAME effect
  // (not in a second mount-only effect): under React 18 StrictMode the mount
  // effect runs → cleans up → runs again, and a restore that keyed off a
  // second effect's mount-time `document.activeElement` would read the panel
  // itself and hand focus straight back out, neutering the Tab trap and the
  // Escape handler below.
  useEffect(() => {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    panelRef.current?.focus()
    return () => {
      const opener = openerRef.current
      openerRef.current = null
      // Hand focus back to the opener, but never steal it from wherever the
      // user has since moved it (the document body means focus was dropped,
      // not moved on purpose).
      if (opener === null || !opener.isConnected) return
      const active = document.activeElement
      if (active === null || active === document.body) opener.focus()
    }
  }, [])

  const copy = useCallback((): void => {
    if (state.result === undefined) return
    const text = state.result.text
    const done = (ok: boolean): void => setCopied(ok ? 'ok' : 'failed')
    // navigator.clipboard only exists in secure contexts (https / localhost);
    // guard the dereference and fall back for plain-http LAN access.
    if (navigator.clipboard !== undefined) {
      navigator.clipboard.writeText(text).then(() => done(true), () => done(fallbackCopy(text)))
      return
    }
    done(fallbackCopy(text))
  }, [state.result])

  const formatMs = (ms: number): string => (ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`)

  return (
    <div className="dsh-pe-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel() }}>
      <section
        ref={panelRef}
        className="dsh-pe-panel"
        role="dialog"
        aria-modal="true"
        aria-label={t('panel.title')}
        tabIndex={-1}
      >
        <header className="dsh-pe-head">
          <span>✨ {t('panel.title')}</span>
          {state.phase === 'result' && state.result !== undefined && (
            <span className="dsh-pe-meta">
              {t('panel.model', { provider: state.result.provider, model: state.result.model })} · {t('panel.elapsed', { ms: formatMs(state.result.elapsedMs) })}
            </span>
          )}
          <button type="button" className="dsh-pe-close" aria-label={t('panel.close')} onClick={onCancel}>✕</button>
        </header>
        {state.phase === 'loading' && (
          <div className="dsh-pe-loading">
            {state.streaming === undefined || state.streaming === '' ? (
              <>
                <div className="dsh-pe-spin" aria-hidden />
                <div>{t('panel.loading')}</div>
                <div className="dsh-pe-hint">{t('panel.loading.hint')}</div>
              </>
            ) : (
              // Incremental view: the text already generated, replaced by the
              // normalized full body the moment the call settles.
              <div className="dsh-pe-stream">
                <div className="dsh-pe-col-title">
                  <span className="dsh-pe-spin small" aria-hidden />
                  {t('panel.streaming')}
                </div>
                <pre className="dsh-pe-col-text">{state.streaming}</pre>
              </div>
            )}
          </div>
        )}
        {state.phase === 'error' && state.error !== undefined && (
          <div className="dsh-pe-error">
            {state.error.localized !== undefined ? (
              // Client-side guard failures carry their own pre-localized copy.
              <div>{state.error.localized}</div>
            ) : (
              <>
                <div>{localizedErrorMessage(t, state.error.code, state.error.params)}</div>
                {state.error.message !== undefined && state.error.message !== '' && (
                  <div className="dsh-pe-error-detail">{state.error.message}</div>
                )}
              </>
            )}
          </div>
        )}
        {state.phase === 'result' && state.result !== undefined && (
          <div className="dsh-pe-body">
            <div className="dsh-pe-col">
              <div className="dsh-pe-col-title">{t('panel.original')}</div>
              <pre className="dsh-pe-col-text">{state.original}</pre>
            </div>
            <div className="dsh-pe-col">
              <div className="dsh-pe-col-title">{t('panel.enhanced')}</div>
              <pre className="dsh-pe-col-text">{state.result.text}</pre>
            </div>
          </div>
        )}
        {state.phase === 'result' && state.stale && (
          <div className="dsh-pe-stale">⚠ {t('panel.stale.warn')}</div>
        )}
        <footer className="dsh-pe-foot">
          <span className="dsh-pe-grow" />
          {state.phase === 'error' && retryable(state.error?.code) && onRetry !== undefined && (
            <button type="button" className="dsh-pe-btn-action plain" onClick={onRetry}>{t('panel.retry')}</button>
          )}
          {state.phase === 'result' && (
            <>
              <button type="button" className="dsh-pe-btn-action plain" onClick={copy}>
                {copied === 'ok' ? t('panel.copied') : copied === 'failed' ? t('panel.copyFailed') : t('panel.copy')}
              </button>
              <button type="button" className="dsh-pe-btn-action primary" onClick={onApply}>{t('panel.apply')}</button>
            </>
          )}
          {state.phase !== 'result' && (
            <button type="button" className="dsh-pe-btn-action plain" onClick={onCancel}>
              {state.phase === 'loading' ? t('panel.cancel') : t('panel.close')}
            </button>
          )}
        </footer>
      </section>
    </div>
  )
}
