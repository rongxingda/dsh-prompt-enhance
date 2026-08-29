// @vitest-environment jsdom
/**
 * Component-level regression tests for the composer enhance flow: the guard
 * chain, the loading → result → apply → undo loop (including the apply/
 * pushUndo/setDraft/UndoBar ordering that must survive React batching),
 * stale marking both ways, and busy-state behavior. The host route is
 * mocked; the ui-state module is the real one.
 * @module tests/client-components
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import { useSyncExternalStore } from 'react'
import type { InputState } from '@deepseek-ai/dsh-client-ui-conversation'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { EnhanceButton } from '../src/client/EnhanceButton'
import { UndoBar } from '../src/client/UndoBar'
import { zh } from '../src/client/locales'
import * as ui from '../src/client/ui-state'

vi.mock('../src/client/enhance-client', () => ({
  EnhanceClientError: class extends Error {
    detail: { code: string; message: string }
    constructor(detail: { code: string; message: string }) {
      super(detail.message)
      this.detail = detail
    }
  },
  requestEnhance: vi.fn(),
}))

// eslint-disable-next-line ts/no-require-imports
const { requestEnhance } = await import('../src/client/enhance-client') as typeof import('../src/client/enhance-client')

const t = ((key: string, params?: Record<string, unknown>): string => {
  let s = (zh as Record<string, string>)[key] ?? key
  for (const [name, value] of Object.entries(params ?? {})) s = s.split(`{${name}}`).join(String(value))
  return s
}) as TranslateNS<'prompt-enhance'>

/** Minimal fake of the per-session input machine store: synchronous, like the real one. */
function makeFakeInput(initial: Partial<InputState> & { draft: string }) {
  let state: InputState = {
    phase: 'plain',
    occurrences: [],
    imageIds: [],
    draftRev: 0,
    queue: [],
    ...initial,
  } as InputState
  const subscribers = new Set<() => void>()
  function useInput<S>(selector: (s: InputState) => S): S {
    return useSyncExternalStore(
      (onStoreChange) => {
        subscribers.add(onStoreChange)
        return () => {
          subscribers.delete(onStoreChange)
        }
      },
      () => selector(state),
    )
  }
  return {
    useInput,
    /** Simulate one machine publish: new snapshot object, all subscribers notified. */
    set(partial: Partial<InputState>): void {
      state = { ...state, ...partial }
      for (const notify of subscribers) notify()
    },
  }
}

function renderComposer(input: ReturnType<typeof makeFakeInput>, inputActions: Parameters<typeof EnhanceButton>[0]['inputActions']): void {
  const props = { t, sessionId: 's1', useInput: input.useInput, inputActions } as never
  render(
    <>
      <EnhanceButton {...props} />
      <UndoBar {...props} />
    </>,
  )
}

const enhanceButton = (): HTMLButtonElement => screen.getByRole('button', { name: zh['button.title'] }) as HTMLButtonElement

beforeEach(() => {
  vi.mocked(requestEnhance).mockReset()
})

describe('EnhanceButton guard chain', () => {
  afterEach(cleanup)

  it('refuses an empty draft with the localized empty message', () => {
    const input = makeFakeInput({ draft: '   ' })
    renderComposer(input, { setDraft: vi.fn() } as never)
    fireEvent.click(enhanceButton())
    expect(screen.getByText(zh['error.empty'])).toBeTruthy()
    expect(requestEnhance).not.toHaveBeenCalled()
  })

  it('refuses image-only drafts', () => {
    const input = makeFakeInput({ draft: '', imageIds: ['img1' as never] })
    renderComposer(input, { setDraft: vi.fn() } as never)
    fireEvent.click(enhanceButton())
    expect(screen.getByText(zh['error.imagesOnly'])).toBeTruthy()
  })

  it('refuses drafts containing reference chips', () => {
    const input = makeFakeInput({ draft: '文本', occurrences: [{}] as never })
    renderComposer(input, { setDraft: vi.fn() } as never)
    fireEvent.click(enhanceButton())
    expect(screen.getByText(zh['error.occurrences'])).toBeTruthy()
  })
})

describe('enhance → apply → undo loop', () => {
  afterEach(cleanup)

  it('runs the full loop: loading → result → apply fills back and raises the undo bar → undo restores', async () => {
    const input = makeFakeInput({ draft: '旧原文' })
    const setDraft = vi.fn((text: string) => input.set({ draft: text }))
    renderComposer(input, { setDraft } as never)
    vi.mocked(requestEnhance).mockResolvedValue({ text: '增强文本', provider: 'p', model: 'm', elapsedMs: 5 })

    fireEvent.click(enhanceButton())
    expect(await screen.findByText('增强文本')).toBeTruthy()
    expect(requestEnhance).toHaveBeenCalledWith({ sessionId: 's1', text: '旧原文' }, expect.anything())

    fireEvent.click(screen.getByRole('button', { name: zh['panel.apply'] }))
    expect(setDraft).toHaveBeenCalledWith('增强文本')
    // The undo bar must survive React batching: the pushed entry stays even
    // though the draft just changed to the applied text (regression lock for
    // the apply → pushUndo → setDraft → UndoBar ordering).
    expect(screen.getByText(zh['undo.applied'])).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: zh['undo.undo'] }))
    expect(setDraft).toHaveBeenLastCalledWith('旧原文')
    expect(screen.queryByText(zh['undo.applied'])).toBeNull()
  })

  it('marks the result stale (both ways) when the draft changes after the request started', async () => {
    const input = makeFakeInput({ draft: '旧原文' })
    renderComposer(input, { setDraft: vi.fn() } as never)
    vi.mocked(requestEnhance).mockResolvedValue({ text: '增强文本', provider: 'p', model: 'm', elapsedMs: 5 })

    fireEvent.click(enhanceButton())
    await screen.findByText('增强文本')
    // User edits during the result view → stale warning appears…
    act(() => { input.set({ draft: '编辑后的新文本' }) })
    expect(await screen.findByText(`⚠ ${zh['panel.stale.warn']}`)).toBeTruthy()
    // …and disappears again when the draft matches the source text.
    act(() => { input.set({ draft: '旧原文' }) })
    await screen.findByText(zh['panel.enhanced'])
    expect(screen.queryByText(`⚠ ${zh['panel.stale.warn']}`)).toBeNull()
  })

  it('applying over a diverged draft pushes the CURRENT draft as undo original', async () => {
    const input = makeFakeInput({ draft: '旧原文' })
    const setDraft = vi.fn((text: string) => input.set({ draft: text }))
    renderComposer(input, { setDraft } as never)
    vi.mocked(requestEnhance).mockResolvedValue({ text: '增强文本', provider: 'p', model: 'm', elapsedMs: 5 })

    fireEvent.click(enhanceButton())
    await screen.findByText('增强文本')
    act(() => { input.set({ draft: '用户编辑的新文本' }) })
    fireEvent.click(screen.getByRole('button', { name: zh['panel.apply'] }))
    expect(setDraft).toHaveBeenLastCalledWith('增强文本')
    // Undo restores the user's latest edits, not the stale pre-enhance text.
    fireEvent.click(screen.getByRole('button', { name: zh['undo.undo'] }))
    expect(setDraft).toHaveBeenLastCalledWith('用户编辑的新文本')
  })

  it('ignores a click while this session is already enhancing (no orphaned panel swap)', async () => {
    const input = makeFakeInput({ draft: '草稿' })
    renderComposer(input, { setDraft: vi.fn() } as never)
    vi.mocked(requestEnhance).mockReturnValue(new Promise(() => {}))

    fireEvent.click(enhanceButton())
    expect(await screen.findByText(zh['panel.loading'])).toBeTruthy()
    fireEvent.click(enhanceButton())
    // The loading panel is untouched — no error panel swap, request not orphaned.
    expect(screen.getByText(zh['panel.loading'])).toBeTruthy()
    expect(screen.queryByText(zh['error.phase'])).toBeNull()
  })
})
