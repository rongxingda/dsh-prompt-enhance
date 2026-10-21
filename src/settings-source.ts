/**
 * Live configuration source across dsh generations.
 *
 * The plugin must read the operator's current section on EVERY request
 * (Settings → 插件配置 is meant to change behaviour without a restart), but the
 * API that exposes it has moved three times:
 *
 * - **SettingsForms** (dsh >= 0.1.5-rc.3, including the whole 0.2.x line):
 *   `ctx.settings.describe()` returns one descriptor per profile entry and there
 *   is **no section installer at all** — a plugin's page is generated from the
 *   Config schema the loader already holds. The 0.1.x `installSettingsSection`
 *   export was deleted in this generation, so the previous probe found nothing
 *   and silently pinned the plugin to its boot-time config: every settings edit
 *   landed on disk and never reached a request.
 * - **0.1.2-alpha**: `ctx.settings.installSection(owner, ns, schema, entry, hooks)`,
 *   with the section pushed back through `hooks.setSource`.
 * - **0.1.1-rc**: the standalone `installSettingsSection(...)` module export.
 *
 * Every path is probed at runtime, in that order; a host that speaks none of
 * them keeps the composition entry as its configuration. Nothing here may
 * throw: a settings integration is optional by design, and the host half must
 * still mount without it.
 * @module dsh-prompt-enhance/settings-source
 */

import type { Context } from '@deepseek-ai/cordis'

/** One entry of `SettingsForms.describe()` (structural: brand types stay off this path). */
interface SettingsRowLike {
  ns?: unknown
  value?: unknown
  user?: unknown
}

/** The 0.2.x settings service surface this module probes for. */
interface SettingsFormsLike {
  describe?: (options?: unknown) => unknown
  configure?: (presentation: { auto?: boolean }, owner?: unknown) => unknown
}

/** The 0.1.2-alpha settings service surface. */
interface SectionInstallerLike {
  installSection?: (owner: Context, ns: string, schema: unknown, entry: unknown, hooks: unknown) => unknown
}

/** Hooks the legacy installers call back through. */
export interface LegacySectionHooks {
  setSource: (source: () => unknown) => void
  onChange: () => void
  validate: (value: unknown) => void
}

/** Options of one settings source. */
export interface SettingsSourceOptions {
  /** Settings namespace (also the fallback row id). */
  namespace: string
  /** Profile entry ids the plugin may be served under, in probe order. */
  rowIds: readonly string[]
  /** Composition config from `apply()` — the answer when the host cannot read live. */
  fallback: () => unknown
  /** Schema handed to the legacy installers. */
  schema: unknown
  /** Entry value handed to the legacy installers. */
  entry: unknown
  /** Hooks the legacy installers push updates through. */
  hooks: LegacySectionHooks
}

/** One resolved settings source. */
export interface SettingsSource {
  /**
   * The raw section the next request should resolve. Never throws: a broken
   * settings layer degrades to the composition entry.
   */
  read(): unknown
  /** Whether the host answers live reads (as opposed to a pinned section). */
  live(): boolean
  /** The profile entry id the host serves this plugin under, once known. */
  rowId(): string | undefined
}

/** Narrow an untrusted describe() answer into rows. */
function rowsOf(value: unknown): SettingsRowLike[] {
  return Array.isArray(value) ? value.filter((row): row is SettingsRowLike => row !== null && typeof row === 'object') : []
}

/**
 * Pick this plugin's row out of one describe() answer.
 *
 * Ids are probed in order first (an aggregate bundle renames rows, and the
 * documented ids are the ones the plugin controls) and only then by substring,
 * so a future rename still resolves instead of silently falling back to the
 * boot-time config.
 * @param rows - descriptors returned by describe().
 * @param rowIds - candidate entry ids, in preference order.
 * @returns the matched row, when one carries a value.
 */
function pickRow(rows: SettingsRowLike[], rowIds: readonly string[]): SettingsRowLike | undefined {
  for (const id of rowIds) {
    const hit = rows.find((row) => String(row.ns ?? '') === id)
    if (hit !== undefined && hit.value !== undefined) return hit
  }
  return rows.find((row) => String(row.ns ?? '').includes('prompt-enhance') && row.value !== undefined)
}

/**
 * Install the settings source for one plugin instance.
 *
 * The returned source is safe to call before the settings service mounts: it
 * answers with {@link SettingsSourceOptions.fallback} until a live reader is
 * installed, then switches to the host's own section for every later read.
 * @param ctx - the plugin instance's context.
 * @param options - namespace, candidate row ids, fallback, and legacy hooks.
 * @returns the source; `read()` per request, `live()` for diagnostics.
 */
export function installSettingsSource(ctx: Context, options: SettingsSourceOptions): SettingsSource {
  let reader: (() => unknown) | undefined
  let resolvedRowId: string | undefined

  /**
   * Hooks handed to the legacy installers. `setSource` doubles as this
   * module's own reader, so a host that pushes its section through the legacy
   * path gets the same per-request freshness as the describe-backed one — the
   * caller does not have to remember the pushed value.
   */
  const legacyHooks: LegacySectionHooks = {
    setSource: (source) => {
      reader = source
      options.hooks.setSource(source)
    },
    onChange: () => options.hooks.onChange(),
    validate: (value) => options.hooks.validate(value),
  }

  ctx.inject(['settings'], (settingsCtx: Context) => {
    const service = (settingsCtx as unknown as { settings?: SettingsFormsLike & SectionInstallerLike }).settings
    if (service === undefined) return

    // 1. dsh >= 0.1.5-rc.3: the forms service. The page is generated from the
    //    Config schema the loader holds, so `configure` only states the policy
    //    explicitly; failing to register it changes nothing functionally.
    if (typeof service.describe === 'function') {
      reader = (): unknown => {
        const rows = rowsOf(service.describe?.({ redactSecrets: false }))
        const row = pickRow(rows, options.rowIds)
        if (row === undefined) return undefined
        resolvedRowId = String(row.ns)
        return row.value
      }
      try {
        settingsCtx.effect(() => {
          try {
            const dispose = service.configure?.({ auto: true }, (ctx as unknown as { fiber?: unknown }).fiber)
            return typeof dispose === 'function' ? dispose as () => void : () => {}
          } catch {
            // Already registered (a re-applied entry) or unsupported: the
            // auto-generated page is the default anyway.
            return () => {}
          }
        }, 'prompt-enhance: settings page policy')
      } catch {
        // `ctx.effect` unavailable on an exotic context: policy stays default.
      }
      return
    }

    // 2. 0.1.2-alpha: the installer moved onto the service.
    if (typeof service.installSection === 'function') {
      try {
        service.installSection(ctx, options.namespace, options.schema, options.entry, legacyHooks)
      } catch {
        // Legacy installer refused (already installed / shape drift): the
        // composition entry stays authoritative.
      }
      return
    }

    // 3. 0.1.1-rc: the standalone module export. Loaded dynamically so a build
    //    whose settings module no longer exports it cannot fail at import time.
    void import('@deepseek-ai/dsh-settings').then((mod) => {
      const legacy = mod as unknown as {
        installSettingsSection?: (owner: Context, ns: unknown, schema: unknown, entry: unknown, hooks: unknown) => void
        settingsNamespace?: (ns: string) => unknown
      }
      if (typeof legacy.installSettingsSection !== 'function') return
      try {
        legacy.installSettingsSection(
          ctx,
          typeof legacy.settingsNamespace === 'function' ? legacy.settingsNamespace(options.namespace) : options.namespace,
          options.schema,
          options.entry,
          legacyHooks,
        )
      } catch {
        // Same policy as above: no settings is a degradation, not a failure.
      }
    }, () => {
      // Module unresolvable on this host: the composition entry stands.
    })
  })

  return {
    read(): unknown {
      if (reader !== undefined) {
        try {
          const value = reader()
          if (value !== undefined) return value
        } catch {
          // A describe() hiccup must not fail the request it was read for.
        }
      }
      return options.fallback()
    },
    live(): boolean {
      return reader !== undefined
    },
    rowId(): string | undefined {
      return resolvedRowId
    },
  }
}
