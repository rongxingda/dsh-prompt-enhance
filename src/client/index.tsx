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

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
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

/** Required services: slots for the two composer entries, settings scope for live config, locale for the t seat. */
export const inject = ['slots', 'settingsScope', 'locale']

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
  ctx.inject(['settingsScope'], (settingsCtx: ClientContext) => {
    const scope = settingsCtx.settingsScope.bind({ namespace: NS, decode: decodeClientSettings })
    const sync = (): void => {
      setClientSettings(scope.getSnapshot().value ?? decodeClientSettings(undefined))
    }
    sync()
    ctx.effect(() => scope.subscribe(sync), 'dsh-prompt-enhance: settings mirror')
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
