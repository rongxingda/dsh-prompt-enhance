/**
 * Browser half of the prompt-enhance plugin: registers the composer
 * enhance button (conversation.input.right), the undo bar
 * (conversation.input.dock), the zh/en dictionaries, the settings mirror,
 * and the configurable global shortcut. Failure policy mirrors the
 * describe-image family: every optional wiring failure is caught and
 * logged-never-thrown, because the web shell fails the whole boot when a
 * plugin apply throws.
 * @module dsh-prompt-enhance/client
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { EnhanceButton } from './EnhanceButton'
import { UndoBar } from './UndoBar'
import * as ui from './ui-state'
import { dictionaries, NS } from './locales'
import { ensureStyles } from './styles'
import { matchesShortcut, parseShortcut } from './shortcut'
import { decodeClientSettings, getClientSettings, setClientSettings } from './settings'

/** Locale namespace of the browser half. */
export { NS }

/** Required services: slots for the two composer entries, locale for the t seat.
 *
 * The settings scope is deliberately NOT listed: the harness renamed it
 * (`settingsScope` on 0.1.1-rc.x, `configForms` on 0.1.2-alpha+), and a
 * module-level inject of a service this host never provides keeps the entry
 * `pending (waiting for service: …)` forever. Both generations are resolved
 * through nested ctx.inject instead, so the entry always activates and a host
 * missing both simply runs on the mirrored defaults. */
export const inject = ['slots', 'locale']

/** Apply the browser half. */
export function apply(ctx: ClientContext): void {
  ensureStyles()

  ctx.effect(() => {
    try {
      return ctx.locale.register(NS, dictionaries)
    } catch {
      return () => {}
    }
  }, 'dsh-prompt-enhance: dictionaries')

  // The settings mirror: re-read on every committed change so the button,
  // the guards, and the shortcut follow Settings → 插件配置 live. The
  // subscription disposer rides ctx.effect (ctx.inject only runs the
  // callback; it does not manage a returned disposer).
  //
  // Both settings-scope generations are probed at runtime, mirroring the host
  // half's installSettingsSectionCompat:
  // - 0.1.2-alpha+: ctx.configForms.get(ns) — getSnapshot()/subscribe() face.
  // - 0.1.1-rc.x:  ctx.settingsScope.bind({ namespace, decode }) face.
  // Whichever the host provides wins; neither → defaults (entry still active).
  const mirror = (face: {
    getSnapshot: () => { value: unknown }
    subscribe: (listener: () => void) => () => void
  }): void => {
    const sync = (): void => setClientSettings(decodeClientSettings(face.getSnapshot().value))
    sync()
    ctx.effect(() => face.subscribe(sync), 'dsh-prompt-enhance: settings mirror')
  }
  ctx.inject(['configForms'], (settingsCtx: ClientContext) => {
    const forms = (settingsCtx as unknown as {
      configForms?: { get: (entryId: string) => Parameters<typeof mirror>[0] }
    }).configForms
    if (typeof forms?.get === 'function') mirror(forms.get(NS))
  })
  ctx.inject(['settingsScope'], (settingsCtx: ClientContext) => {
    const scope = (settingsCtx as unknown as {
      settingsScope?: {
        bind: (options: { namespace: string; decode: (section: unknown) => unknown }) => Parameters<typeof mirror>[0]
      }
    }).settingsScope
    if (typeof scope?.bind === 'function') mirror(scope.bind({ namespace: NS, decode: decodeClientSettings }))
  })

  ctx.inject(['slots'], (slotsCtx: ClientContext) => {
    const slots = slotsCtx.slots
    return slots.inject('conversation.input.right', () => {
      try {
        return slots.register(
          { name: 'conversation.input.right', id: 'prompt-enhance', order: 60, locale: NS },
          EnhanceButton,
        )
      } catch {
        return () => {}
      }
    })
  })

  ctx.inject(['slots'], (slotsCtx: ClientContext) => {
    const slots = slotsCtx.slots
    return slots.inject('conversation.input.dock', () => {
      try {
        return slots.register(
          { name: 'conversation.input.dock', id: 'prompt-enhance-undo', order: 90, locale: NS },
          UndoBar,
        )
      } catch {
        return () => {}
      }
    })
  })

  // The configurable shortcut: acts on the composer the user is working in;
  // never swallows keys unless the exact combo matches.
  ctx.effect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.isComposing) return
      const combo = parseShortcut(getClientSettings().shortcut)
      if (!matchesShortcut(event, combo)) return
      const target = ui.shortcutTarget()
      if (target === undefined) return
      event.preventDefault()
      event.stopPropagation()
      target()
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, 'dsh-prompt-enhance: shortcut')
}
