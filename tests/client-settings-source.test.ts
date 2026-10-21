/**
 * The browser settings source across dsh generations.
 *
 * On the 0.2.x line the mirror lives behind `ctx.configForms`; `settingsScope`
 * is gone. The previous code probed only the removed service, which is why
 * `enabled`, `maxInputChars`, `shortcut` and `streaming` edits never reached
 * the composer. These cases pin the new precedence and the "never throw on
 * boot" contract.
 * @module tests/client-settings-source
 */

import { describe, expect, it, vi } from 'vitest'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { installClientSettingsSource } from '../src/client/settings-source'
import { PROMPT_ENHANCE_ROW_IDS } from '../src/shared/protocol'

/** Build a browser context that mounts exactly the services it is given. */
function contextWith(services: Record<string, unknown>): { ctx: ClientContext; disposers: (() => void)[] } {
  const disposers: (() => void)[] = []
  const ctx = {
    effect(execute: () => unknown): () => void {
      const disposer = execute()
      if (typeof disposer === 'function') disposers.push(disposer as () => void)
      return () => {}
    },
    inject(names: string[], callback: (ctx: ClientContext) => unknown): void {
      if (names.every((name) => services[name] !== undefined)) {
        callback({ ...ctx, ...services } as unknown as ClientContext)
      }
    },
  } as unknown as ClientContext
  return { ctx, disposers }
}

/** One fake config form with a mutable snapshot and a subscriber list. */
function fakeForm(initial: unknown): {
  form: Record<string, unknown>
  publish: (value: unknown, status?: string) => void
  listeners: (() => void)[]
  disposed: number
} {
  let snapshot: { status: string; value: unknown } = { status: 'ready', value: initial }
  const listeners: (() => void)[] = []
  const state = { disposed: 0 }
  return {
    form: {
      getSnapshot: (): typeof snapshot => snapshot,
      subscribe: (listener: () => void): (() => void) => {
        listeners.push(listener)
        return () => {
          const index = listeners.indexOf(listener)
          if (index !== -1) listeners.splice(index, 1)
        }
      },
      dispose: (): void => {
        state.disposed += 1
      },
    },
    publish: (value: unknown, status = 'ready'): void => {
      snapshot = { status, value }
      for (const listener of [...listeners]) listener()
    },
    listeners,
    get disposed(): number {
      return state.disposed
    },
  }
}

const options = (onSection: (section: unknown) => void) => ({ rowIds: PROMPT_ENHANCE_ROW_IDS, onSection })

describe('installClientSettingsSource: configForms (dsh 0.2.x)', () => {
  it('adopts the served section and follows later changes', () => {
    const fake = fakeForm({ enabled: false, maxInputChars: 5000, shortcut: 'ctrl+alt+p', streaming: false })
    const forms = {
      get: (): unknown => fake.form,
      describe: (): unknown => ({ getSnapshot: () => ({ view: { namespaces: [{ ns: 'prompt-enhance' }] } }) }),
    }
    const { ctx } = contextWith({ configForms: forms })
    const onSection = vi.fn()
    installClientSettingsSource(ctx, options(onSection))

    expect(onSection).toHaveBeenCalledWith({ enabled: false, maxInputChars: 5000, shortcut: 'ctrl+alt+p', streaming: false })

    fake.publish({ enabled: true, maxInputChars: 9000 })
    expect(onSection).toHaveBeenLastCalledWith({ enabled: true, maxInputChars: 9000 })
  })

  it('resolves the row id an aggregate bundle renamed', () => {
    const fake = fakeForm({ enabled: false })
    const seen: string[] = []
    const forms = {
      get: (id: string): unknown => {
        seen.push(id)
        return fake.form
      },
      describe: (): unknown => ({ getSnapshot: () => ({ view: { namespaces: [{ ns: 'web-ui-prompt-enhance' }] } }) }),
    }
    const { ctx } = contextWith({ configForms: forms })
    installClientSettingsSource(ctx, options(vi.fn()))
    expect(seen).toEqual(['web-ui-prompt-enhance'])
  })

  it('ignores an unavailable namespace instead of blanking the mirror', () => {
    const fake = fakeForm(undefined)
    const onSection = vi.fn()
    const forms = { get: (): unknown => fake.form }
    const { ctx } = contextWith({ configForms: forms })
    installClientSettingsSource(ctx, options(onSection))
    expect(onSection).not.toHaveBeenCalled()

    fake.publish({ enabled: false }, 'unavailable')
    expect(onSection).not.toHaveBeenCalled()
  })

  it('releases its subscription without disposing the provider-owned form', () => {
    const fake = fakeForm({ enabled: true })
    const { ctx, disposers } = contextWith({ configForms: { get: (): unknown => fake.form } })
    installClientSettingsSource(ctx, options(vi.fn()))
    expect(disposers.length).toBeGreaterThan(0)
    for (const dispose of disposers) dispose()
    expect(fake.listeners).toHaveLength(0)
    // `configForms.get()` caches one form per entry and shares it with the
    // settings page, so disposing it would freeze that page for the session.
    expect(fake.disposed).toBe(0)
  })

  it('rebinds when the namespace list settles after the plugin applied', () => {
    // Before the describe mirror loads, the configured id is the only candidate.
    const early = fakeForm(undefined)
    const renamed = fakeForm({ enabled: false, maxInputChars: 777 })
    const seen: string[] = []
    const listeners: (() => void)[] = []
    let namespaces: { ns: string }[] = []
    const forms = {
      get: (id: string): unknown => {
        seen.push(id)
        return id === 'web-ui-prompt-enhance' ? renamed.form : early.form
      },
      describe: (): unknown => ({
        getSnapshot: () => ({ view: { namespaces } }),
        subscribe: (listener: () => void): (() => void) => {
          listeners.push(listener)
          return () => {}
        },
      }),
    }
    const { ctx } = contextWith({ configForms: forms })
    const onSection = vi.fn()
    installClientSettingsSource(ctx, options(onSection))
    expect(seen).toEqual(['prompt-enhance'])
    expect(onSection).not.toHaveBeenCalled()

    namespaces = [{ ns: 'web-ui-prompt-enhance' }]
    for (const listener of [...listeners]) listener()
    expect(seen).toEqual(['prompt-enhance', 'web-ui-prompt-enhance'])
    expect(onSection).toHaveBeenCalledWith({ enabled: false, maxInputChars: 777 })
    // The new form keeps being followed after the rebind.
    renamed.publish({ enabled: true, maxInputChars: 1 })
    expect(onSection).toHaveBeenLastCalledWith({ enabled: true, maxInputChars: 1 })
    expect(early.listeners).toHaveLength(0)
  })

  it('does not rebind while the served id is unchanged', () => {
    const fake = fakeForm({ enabled: true })
    const seen: string[] = []
    const listeners: (() => void)[] = []
    const forms = {
      get: (id: string): unknown => {
        seen.push(id)
        return fake.form
      },
      describe: (): unknown => ({
        getSnapshot: () => ({ view: { namespaces: [{ ns: 'prompt-enhance' }] } }),
        subscribe: (listener: () => void): (() => void) => {
          listeners.push(listener)
          return () => {}
        },
      }),
    }
    const { ctx } = contextWith({ configForms: forms })
    installClientSettingsSource(ctx, options(vi.fn()))
    for (const listener of [...listeners]) listener()
    for (const listener of [...listeners]) listener()
    expect(seen).toEqual(['prompt-enhance'])
    expect(fake.listeners).toHaveLength(1)
  })
})

describe('installClientSettingsSource: precedence', () => {
  it('keeps the core config form when an aggregate binder mounts later', () => {
    const core = fakeForm({ enabled: false, maxInputChars: 5000 })
    const bound = fakeForm({ enabled: true, maxInputChars: 1 })
    const binder = { bind: (): unknown => bound.form }
    const { ctx } = contextWith({ configForms: { get: (): unknown => core.form }, webUiSettings: binder })
    const onSection = vi.fn()
    installClientSettingsSource(ctx, options(onSection))

    // configForms adopts first (rank 3); the binder's later push is refused.
    expect(onSection).toHaveBeenCalledTimes(1)
    bound.publish({ enabled: true, maxInputChars: 1 })
    expect(onSection).toHaveBeenCalledTimes(1)
  })

  it('uses the aggregate binder when the core service is absent', () => {
    const bound = fakeForm({ enabled: false, maxInputChars: 4321 })
    const binder = { bind: (): unknown => bound.form }
    const { ctx } = contextWith({ webUiSettings: binder })
    const onSection = vi.fn()
    installClientSettingsSource(ctx, options(onSection))
    expect(onSection).toHaveBeenCalledWith({ enabled: false, maxInputChars: 4321 })
  })

  it('uses the legacy settings scope when nothing newer is mounted', () => {
    const scoped = fakeForm({ enabled: false, maxInputChars: 2222 })
    const scope = { bind: (): unknown => scoped.form }
    const { ctx } = contextWith({ settingsScope: scope })
    const onSection = vi.fn()
    installClientSettingsSource(ctx, options(onSection))
    expect(onSection).toHaveBeenCalledWith({ enabled: false, maxInputChars: 2222 })
  })
})

describe('installClientSettingsSource: no settings surface', () => {
  it('installs nothing and never throws', () => {
    const { ctx, disposers } = contextWith({})
    const onSection = vi.fn()
    expect(() => installClientSettingsSource(ctx, options(onSection))).not.toThrow()
    expect(onSection).not.toHaveBeenCalled()
    expect(disposers).toHaveLength(0)
  })

  it('survives a service whose bind() throws', () => {
    const binder = {
      bind: (): never => {
        throw new Error('not ready')
      },
    }
    const { ctx } = contextWith({ webUiSettings: binder })
    const onSection = vi.fn()
    expect(() => installClientSettingsSource(ctx, options(onSection))).not.toThrow()
    expect(onSection).not.toHaveBeenCalled()
  })
})
