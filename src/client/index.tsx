/**
 * Browser half of the prompt-enhance plugin: registers the composer
 * enhance button (conversation.input.right), the undo bar
 * (conversation.input.dock), the zh/en dictionaries, the settings mirror,
 * and the configurable global shortcut. Failure policy mirrors the
 * describe-image family: every optional wiring failure is caught and
 * logged-never-thrown, because the web shell fails the whole boot when a
 * plugin apply throws.
 *
 * The slot services themselves are reached through a structural face rather
 * than a package type: dsh 0.2.x moved the `slots` service out of
 * `@deepseek-ai/dsh-client-ui-slots` (which now only ships the contract
 * types), and a hard type import of the old home would tie this half to a
 * package the runtime no longer ships.
 * @module dsh-prompt-enhance/client
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Side-effect type imports: these packages declare the standard-props members
// this half reads (`sessionId` on SessionStandardProps) and the selector hook
// types the props resolve to. Without them those members type as `any`, which
// is how a rename in the host silently degrades to untyped reads.
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-store'
import { EnhanceButton } from './EnhanceButton'
import { UndoBar } from './UndoBar'
import * as ui from './ui-state'
import { dictionaries, NS } from './locales'
import { ensureStyles } from './styles'
import { matchesShortcut, parseShortcut } from './shortcut'
import { decodeClientSettings, getClientSettings, setClientSettings } from './settings'
import { installClientSettingsSource } from './settings-source'
import { PROMPT_ENHANCE_ROW_IDS } from '../shared/protocol'

/** Locale namespace of the browser half. */
export { NS }

/** Structural face of the slot registry this half registers into. */
interface SlotsFace {
  inject(name: string, callback: () => unknown): unknown
  register(spec: { name: string; id: string; order?: number; locale?: string }, component: unknown): () => void
}

// No hard service dependencies. Every service this half touches (`configForms`
// / the aggregate `webUiSettings` binder / the legacy `settingsScope`, plus
// `slots` and `locale` from the UI packages a given profile may or may not
// bundle) is reached through `ctx.inject`, which starts the wiring only if and
// when the service actually mounts. A service named here instead would make
// this entry sit `pending` forever on a profile that lacks it — and DSH treats
// a pending entry as a boot failure ("web boot: 1 entry did not activate"),
// taking the whole GUI down with it.
// The cost of that choice is degraded, never broken: a profile with no settings
// surface keeps the bundled default mirror, and one with no locale service
// renders dictionary keys instead of copy.
export const inject: string[] = []

/**
 * Report one failed optional wiring step and keep booting.
 *
 * The policy is catch-and-never-throw — a throw from `apply` fails the whole
 * web boot — but a silent catch made every "the button is not there" report
 * undebuggable: nothing in the browser console, nothing in the host log, and
 * the failure mode is indistinguishable from "this profile does not bundle
 * the service". Log one bounded line per failure and still hand back a no-op
 * disposer so callers stay uniform.
 * @param step - the wiring step that failed, named as the user sees it.
 * @param error - the thrown value, logged as-is.
 * @returns a no-op disposer.
 */
function report(step: string, error: unknown): () => void {
  try {
    console.warn(`[prompt-enhance] ${step} failed; that feature stays off.`, error)
  } catch {
    // A throwing console (a proxied one, or a locked-down shell) must not turn
    // a degraded feature into a failed boot.
  }
  return () => {}
}

/** Apply the browser half. */
export function apply(ctx: ClientContext): void {
  ensureStyles()

  // Dictionaries arrive with the locale service, which is optional here: a
  // profile without it renders dictionary keys instead of localized copy, but
  // the plugin must not block boot over that.
  ctx.inject(['locale'], (localeCtx: ClientContext) => {
    ctx.effect(() => {
      try {
        return localeCtx.locale.register(NS, dictionaries)
      } catch (error) {
        return report('dictionary registration', error)
      }
    }, 'dsh-prompt-enhance: dictionaries')
  })

  // Baseline before anything optional mounts: the bundled mirror equals the
  // host `DEFAULT_CONFIG`, so a profile without a settings surface still gets
  // a working button, guards, and shortcut instead of an unset mirror.
  setClientSettings(decodeClientSettings(undefined))

  // The settings mirror: re-read on every committed change so the button, the
  // guards, and the shortcut follow Settings → 插件配置 live. The source
  // probes the 0.2.x config form first, then the aggregate binder, then the
  // legacy scope — see ./settings-source.
  installClientSettingsSource(ctx, {
    rowIds: PROMPT_ENHANCE_ROW_IDS,
    onSection: (section) => setClientSettings(decodeClientSettings(section)),
  })

  ctx.inject(['slots'], (slotsCtx: ClientContext) => {
    const slots = (slotsCtx as unknown as { slots?: SlotsFace }).slots
    if (slots === undefined) return
    return slots.inject('conversation.input.right', () => {
      try {
        return slots.register(
          { name: 'conversation.input.right', id: 'prompt-enhance', order: 60, locale: NS },
          EnhanceButton as unknown as never,
        )
      } catch (error) {
        return report('composer enhance button slot', error)
      }
    })
  })

  ctx.inject(['slots'], (slotsCtx: ClientContext) => {
    const slots = (slotsCtx as unknown as { slots?: SlotsFace }).slots
    if (slots === undefined) return
    return slots.inject('conversation.input.dock', () => {
      try {
        return slots.register(
          { name: 'conversation.input.dock', id: 'prompt-enhance-undo', order: 90, locale: NS },
          UndoBar as unknown as never,
        )
      } catch (error) {
        return report('undo bar slot', error)
      }
    })
  })

  // The configurable shortcut: acts on the composer the user is working in;
  // never swallows keys unless the exact combo matches.
  ctx.effect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.isComposing) return
      const settings = getClientSettings()
      // Master switch off means this plugin has no claim on the keyboard. The
      // old code still matched, prevented the default and ran a no-op target,
      // so turning the plugin off silently broke whichever host shortcut the
      // user had bound to the same combo, with nothing to explain it.
      if (!settings.enabled) return
      const combo = parseShortcut(settings.shortcut)
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
