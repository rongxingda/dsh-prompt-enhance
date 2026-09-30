// @vitest-environment jsdom
/**
 * The preview panel's error surface: one assertion per upstream `reason`, so a
 * wire reason whose specific fix hint is missing OR unreachable can never
 * silently degrade to the generic `error.upstream` line again.
 *
 * This is the component-level half of the regression locked in
 * `tests/locales.test.ts` (which checks the reason → dictionary-key table).
 * Here the REAL panel runs: `localizedErrorMessage` is exercised through the
 * rendered DOM with the host-shaped error the route actually sends.
 * @module tests/result-panel-error
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { EnhanceError, EnhanceResult } from '../src/shared/protocol'
import { en, zh, type PromptEnhanceKey } from '../src/client/locales'
import { ResultPanel } from '../src/client/ResultPanel'
import type { PanelState } from '../src/client/ui-state'

/** Wire reasons paired with the specific copy an operator must see. */
const REASON_EXPECTATIONS: readonly { reason: string; specific: string }[] = [
  { reason: 'auth', specific: zh['error.upstream.auth'] },
  { reason: 'invalid-credential', specific: zh['error.upstream.invalidCredential'] },
  { reason: 'rate-limit', specific: zh['error.upstream.rateLimit'] },
  { reason: 'quota', specific: zh['error.upstream.quota'] },
  { reason: 'empty', specific: zh['error.upstream.empty'] },
  { reason: 'context-window', specific: zh['error.upstream.contextWindow'] },
  { reason: 'tool-call', specific: zh['error.upstream.toolCall'] },
  { reason: 'max-tokens', specific: zh['error.upstream.maxTokens'] },
]

/** Minimal zh renderer matching the shell's `t` seat (placeholders + unknown keys). */
const t = ((key: string, params?: Record<string, unknown>): string => {
  const dict = zh as Record<string, string>
  let text = dict[key] ?? key
  for (const [name, value] of Object.entries(params ?? {})) text = text.split(`{${name}}`).join(String(value))
  return text
}) as TranslateNS<'prompt-enhance'>

const renderError = (error: EnhanceError): HTMLElement => {
  const state: PanelState = { sessionId: 's1', phase: 'error', original: '旧原文', error }
  return render(<ResultPanel state={state} t={t} onApply={() => {}} onCancel={() => {}} />).container
}

describe('ResultPanel upstream error copy', () => {
  beforeEach(() => {
    // jsdom ships no clipboard; the footer's copy button must stay inert here.
    try {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: vi.fn(() => Promise.resolve()) },
      })
    } catch {
      // Non-configurable in this environment — the panel guards the absence.
    }
  })

  afterEach(() => {
    cleanup()
  })

  it.each(REASON_EXPECTATIONS.map(({ reason, specific }) => [reason, specific] as const))(
    'renders the specific fix hint for reason %s',
    (reason, specific) => {
      const container = renderError({ code: 'upstream', params: { reason } })
      expect(container.textContent).toContain(specific)
      // The generic line must NOT be what the operator reads.
      expect(container.textContent).not.toContain(zh['error.upstream'])
    },
  )

  it('keeps every specific hint distinct from the generic line', () => {
    for (const { specific } of REASON_EXPECTATIONS) {
      expect(specific).not.toBe(zh['error.upstream'])
      expect(specific.trim()).not.toBe('')
    }
  })

  it('falls back to the generic line when the reason has no shipped copy', () => {
    const container = renderError({ code: 'upstream', params: { reason: 'brand-new-reason' } })
    expect(container.textContent).toContain(zh['error.upstream'])
    for (const { specific } of REASON_EXPECTATIONS) {
      expect(container.textContent).not.toContain(specific)
    }
  })

  it('shows the provider detail as a separate line under the localized primary copy', () => {
    const container = renderError({ code: 'upstream', params: { reason: 'quota' }, message: 'provider said: 429 quota' })
    expect(container.textContent).toContain(zh['error.upstream.quota'])
    expect(container.textContent).toContain('provider said: 429 quota')
  })

  it('localizes a server-side over-length rejection through the too-long copy', () => {
    const container = renderError({ code: 'rejected', params: { count: 13000, max: 12000 } })
    const expected = zh['error.tooLong'].split('{count}').join('13000').split('{max}').join('12000')
    expect(container.textContent).toContain(expected)
  })

  it('renders the result phase with the enhanced body and the route metadata', () => {
    const result: EnhanceResult = { text: '增强后的正文', provider: 'p', model: 'm', elapsedMs: 1234 }
    const state: PanelState = { sessionId: 's1', phase: 'result', original: '旧原文', result }
    const container = render(<ResultPanel state={state} t={t} onApply={() => {}} onCancel={() => {}} />).container
    expect(container.textContent).toContain('增强后的正文')
    expect(container.textContent).toContain('1.2s')
  })
})

describe('locale parity for the upstream keys', () => {
  it('has the same upstream key set in both dictionaries', () => {
    const upstream = Object.keys(zh).filter((key) => key.startsWith('error.upstream.')) as PromptEnhanceKey[]
    // Eight reasons, each with dedicated copy — the count the panel table expects.
    expect(upstream.sort()).toEqual(Object.keys(en).filter((key) => key.startsWith('error.upstream.')).sort())
    expect(upstream.length).toBe(REASON_EXPECTATIONS.length)
  })
})
