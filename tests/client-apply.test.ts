// @vitest-environment jsdom
/**
 * The browser half's boot contract: `apply` must survive a shell that provides
 * NONE of the optional services.
 *
 * Why this is a test and not just a comment: DSH loads a plugin only while
 * every service named in its exported `inject` is available
 * (`Plugin.Base.inject` — "Services the plugin requires; it only loads while
 * all are available"). A plugin that hard-declares an optional service —
 * `settingsScope` from the optional settings surface, or `slots`/`locale` from
 * UI packages a minimal profile need not bundle — sits `pending` forever, and
 * the shell reports it as a boot failure on a blank page
 * ("web boot: 1 entry did not activate"). That takes the whole GUI down instead
 * of degrading.
 *
 * These assertions lock the actual contract: the entry declares no required
 * services, and applying it against a context that provides nothing completes
 * with its shortcut effect installed.
 * @module tests/client-apply
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { apply, inject } from '../src/client/index'
import * as ui from '../src/client/ui-state'
import { getClientSettings, setClientSettings } from '../src/client/settings'

beforeEach(() => {
  // The mirror is module-level state; start every case from the shipped default.
  setClientSettings({
    enabled: true,
    maxInputChars: 12000,
    shortcut: 'ctrl+alt+e',
    streaming: true,
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  ui.closePanel()
})

/**
 * A context providing nothing but the machinery `apply` itself uses.
 *
 * `ctx.inject` deliberately does NOT invoke its callback: that is exactly the
 * shell behavior when a service never mounts, and it is the case under test.
 * Effects run immediately, mirroring cordis (whose effect bodies execute on
 * registration), and their disposers are collected.
 */
function bareContext(): { ctx: ClientContext; disposers: (() => void)[] } {
  const disposers: (() => void)[] = []
  const ctx = {
    effect(execute: () => unknown, _label?: string): () => void {
      const disposer = execute()
      if (typeof disposer === 'function') disposers.push(disposer as () => void)
      return () => {}
    },
    inject(): void {
      // No services here, so no wiring callback ever runs.
    },
  } as unknown as ClientContext
  return { ctx, disposers }
}

describe('browser half boot', () => {
  it('declares no required services', () => {
    // An `inject` entry that never mounts fails the whole web boot, so this
    // list must stay empty; every optional service rides `ctx.inject`.
    expect(inject).toEqual([])
  })

  it('applies against a shell with no optional services, without throwing', () => {
    const { ctx } = bareContext()
    expect(() => apply(ctx)).not.toThrow()
  })

  it('installs the global shortcut listener and registers its disposer', () => {
    const addEventListener = vi.spyOn(document, 'addEventListener')
    const { ctx, disposers } = bareContext()
    apply(ctx)
    expect(addEventListener).toHaveBeenCalledWith('keydown', expect.any(Function), true)
    // One effect (the shortcut) survives even with no locale/slots/settingsScope.
    expect(disposers).toHaveLength(1)
    expect(() => disposers[0]!()).not.toThrow()
  })

  it('falls back to the bundled settings mirror instead of an unset one', () => {
    // The mirror must be populated by `apply` itself, not only by a scope
    // callback: with no settings surface there is no callback at all.
    setClientSettings({ enabled: false, maxInputChars: 1, shortcut: '', streaming: false })
    const { ctx } = bareContext()
    apply(ctx)
    const settings = getClientSettings()
    expect(settings.enabled).toBe(true)
    expect(settings.shortcut).toBe('ctrl+alt+e')
    expect(settings.maxInputChars).toBeGreaterThan(1000)
  })
})
