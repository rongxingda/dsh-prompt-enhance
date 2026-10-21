/**
 * Browser-side settings source across dsh generations.
 *
 * The browser half must mirror the operator's section (button visibility, the
 * input cap, the shortcut, the streaming switch) but the service that carries
 * it has been renamed twice:
 *
 * - **dsh >= 0.1.5-rc.3 / the whole 0.2.x line**: `ctx.configForms` — a
 *   per-entry form (`get(entryId)`) exposing `getSnapshot()` / `subscribe()`.
 *   `ctx.settingsScope` does not exist at all, which is why the previous
 *   mirror silently stayed on its bundled defaults: shortcut, `enabled` and
 *   `maxInputChars` edits never reached the UI.
 * - **0.1.7 aggregate bundles**: an optional `webUiSettings` binder exposing
 *   `bind({ namespace })` with the same snapshot face.
 * - **0.1.1-rc**: `ctx.settingsScope.bind({ namespace, decode })`.
 *
 * Sources are probed in that order and ranked, so a host that mounts several
 * of them keeps the most authoritative one and never thrashes between two
 * documents. Absent all three, the bundled mirror keeps the UI working.
 * @module dsh-prompt-enhance/client/settings-source
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'

/** Snapshot face shared by every generation's form object. */
interface FormSnapshotLike {
  status?: unknown
  value?: unknown
}

/** One bound form (config form, binder result, or settings scope). */
interface BoundFormLike {
  getSnapshot?: () => FormSnapshotLike | unknown
  subscribe?: (listener: () => void) => (() => void) | undefined
  dispose?: () => unknown
}

/** The shared describe mirror's read face (`ctx.configForms.describe()`). */
interface DescribeFaceLike {
  getSnapshot?: () => { view?: { namespaces?: readonly { ns?: unknown }[] } } | undefined
  subscribe?: (listener: () => void) => (() => void) | undefined
}

/** The `ctx.configForms` surface this module probes for. */
interface ConfigFormsLike {
  get?: (entryId: string) => BoundFormLike | undefined
  describe?: () => DescribeFaceLike | undefined
}

/** The optional aggregate `webUiSettings` binder surface. */
interface SettingsBinderLike {
  bind?: (spec: { namespace: string }) => BoundFormLike | undefined
}

/** Rank of each source: higher wins when several are mounted. */
const RANK = {
  none: 0,
  legacyScope: 1,
  binder: 2,
  configForms: 3,
} as const

/** Options of one client settings source. */
export interface ClientSettingsSourceOptions {
  /** Candidate profile entry ids, in probe order. */
  rowIds: readonly string[]
  /** Receives every accepted raw section (schema-resolved as the host saw it). */
  onSection: (section: unknown) => void
}

/** The section carried by a snapshot, whichever generation's wrapper it uses. */
function sectionOf(snapshot: unknown): unknown {
  if (snapshot === null || typeof snapshot !== 'object') return undefined
  const record = snapshot as FormSnapshotLike
  if (record.status === 'unavailable') return undefined
  return record.value
}

/** Namespaces the host currently serves, when the forms service can list them. */
function servedNamespaces(forms: ConfigFormsLike): readonly string[] {
  try {
    const namespaces = forms.describe?.()?.getSnapshot?.()?.view?.namespaces
    return Array.isArray(namespaces) ? namespaces.map((entry) => String(entry?.ns ?? '')) : []
  } catch {
    return []
  }
}

/**
 * Install the browser settings mirror for one client instance.
 *
 * Nothing here may throw: the web shell treats a plugin whose apply() throws as
 * a boot failure, so every optional wiring failure degrades to the bundled
 * defaults instead.
 * @param ctx - the browser half's context.
 * @param options - candidate row ids and the section sink.
 */
export function installClientSettingsSource(ctx: ClientContext, options: ClientSettingsSourceOptions): void {
  let rank: number = RANK.none
  const adopt = (next: number, section: unknown): void => {
    if (section === undefined || next < rank) return
    rank = next
    options.onSection(section)
  }

  /** Read and adopt the current snapshot of one bound form. */
  const adoptSnapshot = (next: number, form: BoundFormLike): void => {
    try {
      const section = sectionOf(form.getSnapshot?.())
      if (section !== undefined) adopt(next, section)
    } catch {
      // A form that cannot answer yet keeps the previous value.
    }
  }

  // 1. dsh >= 0.1.5-rc.3: the core per-entry config form.
  ctx.inject(['configForms'], (formsCtx: ClientContext) => {
    const forms = (formsCtx as unknown as { configForms?: ConfigFormsLike }).configForms
    if (forms === undefined || typeof forms.get !== 'function') return

    /**
     * Bound entry id, and the disposer of its subscription.
     *
     * `configForms.get()` returns a form **the settings provider owns** — it caches
     * one per entry and hands the same instance to the settings page. The form's
     * `dispose()` stops it deriving for good (the provider keeps the dead instance
     * in its cache), so this module must never call it: only the subscription is
     * ours to release.
     */
    let boundId: string | undefined
    let unsubscribeForm: (() => void) | undefined

    /**
     * The entry id to bind right now.
     *
     * An aggregate bundle renames rows, so the served list is the authority and
     * the configured candidates are the fallback for a host that cannot list.
     * When the describe mirror has not loaded yet the list is empty — that is why
     * {@link bind} is re-run on every describe tick instead of resolving once.
     */
    const resolveEntryId = (): string | undefined => {
      const served = servedNamespaces(forms)
      return options.rowIds.find((id) => served.includes(id))
        ?? served.find((ns) => ns.includes('prompt-enhance'))
        ?? options.rowIds[0]
    }

    /** Bind (or rebind) the form of the entry the host currently serves. */
    const bind = (): void => {
      const entryId = resolveEntryId()
      if (entryId === undefined || entryId === boundId) return
      try {
        unsubscribeForm?.()
      } catch {
        // Already released with the service.
      }
      unsubscribeForm = undefined
      boundId = entryId
      let form: BoundFormLike | undefined
      try {
        form = forms.get?.(entryId)
      } catch {
        return
      }
      if (form === undefined) return
      adoptSnapshot(RANK.configForms, form)
      try {
        unsubscribeForm = form.subscribe?.(() => adoptSnapshot(RANK.configForms, form as BoundFormLike))
      } catch {
        unsubscribeForm = undefined
      }
    }

    bind()
    // The describe mirror settles after the plugin applies, and its namespace
    // list is what names the row: follow it so a late load (or a rename the
    // first pass could not see) still lands on the plugin's section instead of
    // leaving the mirror on its bundled defaults.
    ctx.effect(() => () => {
      try {
        unsubscribeForm?.()
      } catch {
        // Service already gone.
      }
    }, 'prompt-enhance: settings form mirror')
    try {
      const watch = forms.describe?.()?.subscribe?.(() => bind())
      if (typeof watch === 'function') {
        ctx.effect(() => () => {
          try {
            watch()
          } catch {
            // Service already gone.
          }
        }, 'prompt-enhance: settings namespace watch')
      }
    } catch {
      // A describe face without a subscription still leaves the first bind.
    }
  })

  // 2. 0.1.7 aggregate bundles: the optional settings binder.
  ctx.inject(['webUiSettings'], (binderCtx: ClientContext) => {
    const binder = (binderCtx as unknown as { webUiSettings?: SettingsBinderLike }).webUiSettings
    if (binder === undefined || typeof binder.bind !== 'function') return
    let bound: BoundFormLike | undefined
    for (const namespace of options.rowIds) {
      try {
        bound = binder.bind({ namespace })
      } catch {
        bound = undefined
      }
      if (bound !== undefined) break
    }
    if (bound === undefined) return
    adoptSnapshot(RANK.binder, bound)
    let unsubscribe: (() => void) | undefined
    try {
      unsubscribe = bound.subscribe?.(() => adoptSnapshot(RANK.binder, bound as BoundFormLike))
    } catch {
      unsubscribe = undefined
    }
    ctx.effect(() => () => {
      try {
        unsubscribe?.()
      } catch {
        // Service already gone.
      }
    }, 'prompt-enhance: settings binder mirror')
  })

  // 3. 0.1.1-rc: the element-level settings scope.
  ctx.inject(['settingsScope'], (scopeCtx: ClientContext) => {
    const scopeCtxLike = scopeCtx as unknown as {
      settingsScope?: { bind?: (spec: { namespace: string; decode: (value: unknown) => unknown }) => BoundFormLike }
    }
    const scope = scopeCtxLike.settingsScope
    if (scope === undefined || typeof scope.bind !== 'function') return
    let bound: BoundFormLike
    try {
      // The decode hook is the legacy scope's way of narrowing the section;
      // passing the raw value through keeps one decoder in this plugin.
      bound = scope.bind({ namespace: options.rowIds[0] ?? 'prompt-enhance', decode: (value: unknown) => value })
    } catch {
      return
    }
    adoptSnapshot(RANK.legacyScope, bound)
    let unsubscribe: (() => void) | undefined
    try {
      unsubscribe = bound.subscribe?.(() => adoptSnapshot(RANK.legacyScope, bound))
    } catch {
      unsubscribe = undefined
    }
    ctx.effect(() => () => {
      try {
        unsubscribe?.()
      } catch {
        // Service already gone.
      }
    }, 'prompt-enhance: settings scope mirror')
  })
}
