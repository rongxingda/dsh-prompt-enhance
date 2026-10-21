/**
 * The host settings source across dsh generations.
 *
 * The 0.2.x line serves settings through `SettingsForms.describe()` and has no
 * section installer at all; the 0.1.x lines pushed a section back through
 * `hooks.setSource`. Both are exercised here, because the failure this module
 * exists to prevent is silent: a boot-time snapshot keeps working perfectly
 * while every later settings edit is ignored.
 * @module tests/settings-source
 */

import { describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { installSettingsSource, type LegacySectionHooks } from '../src/settings-source'
import { PROMPT_ENHANCE_ROW_IDS } from '../src/shared/protocol'

const NAMESPACE = 'prompt-enhance'
const FALLBACK = { enabled: true, maxInputChars: 12000, shortcut: 'ctrl+alt+e', streaming: true }

/** Build a context that mounts exactly the services it is given. */
function contextWith(services: Record<string, unknown>): { ctx: Context; disposers: (() => void)[] } {
  const disposers: (() => void)[] = []
  const ctx = {
    effect(execute: () => unknown): () => void {
      const disposer = execute()
      if (typeof disposer === 'function') disposers.push(disposer as () => void)
      return () => {}
    },
    inject(names: string[], callback: (ctx: Context) => unknown): void {
      if (names.every((name) => services[name] !== undefined)) {
        callback({ ...ctx, ...services } as unknown as Context)
      }
    },
  } as unknown as Context
  return { ctx, disposers }
}

/** Options with the legacy hooks captured for assertions. */
function options() {
  const hooks: LegacySectionHooks = { setSource: vi.fn(), onChange: vi.fn(), validate: vi.fn() }
  return {
    hooks,
    value: {
      namespace: NAMESPACE,
      rowIds: PROMPT_ENHANCE_ROW_IDS,
      fallback: () => FALLBACK,
      schema: {},
      entry: FALLBACK,
      hooks,
    },
  }
}

describe('installSettingsSource: SettingsForms (dsh 0.2.x)', () => {
  it('reads the live section from describe() on every call', () => {
    let section: unknown = { enabled: false, maxInputChars: 5000, shortcut: 'ctrl+alt+e', streaming: false }
    const settings = {
      describe: (): unknown[] => [{ ns: NAMESPACE, value: section }],
      configure: (): (() => void) => () => {},
    }
    const { ctx } = contextWith({ settings })
    const { value: opts } = options()
    const source = installSettingsSource(ctx, opts)

    expect(source.live()).toBe(true)
    expect(source.read()).toMatchObject({ enabled: false, maxInputChars: 5000 })

    // A settings edit lands on the very next read — the whole point of the
    // describe-backed path (the 0.1.x installer would have pinned the first).
    section = { enabled: true, maxInputChars: 9000, shortcut: 'ctrl+alt+p', streaming: true }
    expect(source.read()).toMatchObject({ enabled: true, maxInputChars: 9000 })
    expect(source.rowId()).toBe(NAMESPACE)
  })

  it('resolves the row an aggregate bundle renamed', () => {
    const settings = {
      describe: (): unknown[] => [
        { ns: 'llm-deepseek', value: {} },
        { ns: 'web-ui-prompt-enhance', value: { enabled: false } },
      ],
    }
    const { ctx } = contextWith({ settings })
    const source = installSettingsSource(ctx, options().value)
    expect(source.read()).toMatchObject({ enabled: false })
    expect(source.rowId()).toBe('web-ui-prompt-enhance')
  })

  it('falls back to the composition entry when describe() throws', () => {
    const settings = {
      describe: (): unknown[] => {
        throw new Error('loader still settling')
      },
    }
    const { ctx } = contextWith({ settings })
    const source = installSettingsSource(ctx, options().value)
    expect(source.read()).toBe(FALLBACK)
  })

  it('falls back when the host serves no row for this plugin', () => {
    const settings = { describe: (): unknown[] => [{ ns: 'llm-deepseek', value: {} }] }
    const { ctx } = contextWith({ settings })
    const source = installSettingsSource(ctx, options().value)
    expect(source.read()).toBe(FALLBACK)
    expect(source.rowId()).toBeUndefined()
  })

  it('keeps the page policy registration non-fatal', () => {
    const settings = {
      describe: (): unknown[] => [{ ns: NAMESPACE, value: { enabled: true } }],
      // Already configured (a re-applied entry) — must not break the mount.
      configure: (): never => {
        throw new Error('already configured')
      },
    }
    const { ctx } = contextWith({ settings })
    const { value: opts, hooks } = options()
    const source = installSettingsSource(ctx, opts)
    expect(source.read()).toMatchObject({ enabled: true })
    expect(hooks.setSource).not.toHaveBeenCalled()
  })
})

describe('installSettingsSource: legacy installers', () => {
  it('takes the section the 0.1.2-alpha installer pushes', () => {
    let hooks: LegacySectionHooks | undefined
    const settings = {
      installSection: (_owner: unknown, _ns: string, _schema: unknown, _entry: unknown, pushed: LegacySectionHooks): void => {
        hooks = pushed
      },
    }
    const { ctx } = contextWith({ settings })
    const { value: opts, hooks: supplied } = options()
    const source = installSettingsSource(ctx, opts)
    // The installer receives this module's wrapper, which forwards to the
    // caller's hooks while also serving as the source's own reader.
    expect(hooks).toBeDefined()
    expect(typeof hooks?.setSource).toBe('function')

    // Before any push the composition entry stands; afterwards the pushed
    // section wins — for the caller's hooks and for `read()` alike.
    expect(source.read()).toBe(FALLBACK)
    ;(hooks as LegacySectionHooks).setSource(() => ({ enabled: false, maxInputChars: 777 }))
    expect(supplied.setSource).toHaveBeenCalledTimes(1)
    expect(source.read()).toMatchObject({ enabled: false, maxInputChars: 777 })
    expect(source.live()).toBe(true)
  })

  it('survives an installer that throws', () => {
    const settings = {
      installSection: (): never => {
        throw new Error('shape drift')
      },
    }
    const { ctx } = contextWith({ settings })
    const source = installSettingsSource(ctx, options().value)
    expect(source.read()).toBe(FALLBACK)
  })
})

describe('installSettingsSource: no settings service at all', () => {
  it('answers the composition entry and reports "not live"', () => {
    const { ctx } = contextWith({})
    const source = installSettingsSource(ctx, options().value)
    expect(source.live()).toBe(false)
    expect(source.read()).toBe(FALLBACK)
  })
})
