import { describe, expect, it, vi, beforeEach } from 'vitest'
import { apply } from '../src/index'
import { PROMPT_ENHANCE_NAMESPACE } from '../src/config'

/**
 * `apply()` must register its settings section on both harness generations,
 * because `@deepseek-ai/dsh-settings` moved the wiring between them:
 * rc exports standalone helpers; alpha (0.1.2-alpha.x) exposes the same
 * wiring as `ctx.settings.installSection()` and dropped the standalone names.
 * A static named import of those names is a load-time SyntaxError on alpha,
 * which is what these cases guard.
 */
vi.mock('@deepseek-ai/dsh-settings', () => ({
  installSettingsSection: vi.fn(),
  settingsNamespace: (ns: string) => ns,
}))

interface StubContext {
  get: (name: string) => unknown
  inject: (deps: string[], cb: (ctx: unknown) => void) => void
  effect?: (fn: () => () => void) => void
}

/** Minimal registrant context: optional services all answer `undefined`. */
function stubContext(settingsService: unknown, present = true): StubContext {
  return {
    get: () => undefined,
    inject: (deps: string[], cb: (ctx: unknown) => void) => {
      if (present && deps.includes('settings')) cb({ settings: settingsService })
    },
    effect: () => {},
  }
}

async function legacyModule(): Promise<{ installSettingsSection: ReturnType<typeof vi.fn> }> {
  return (await import('@deepseek-ai/dsh-settings')) as unknown as {
    installSettingsSection: ReturnType<typeof vi.fn>
  }
}

beforeEach(async () => {
  vi.clearAllMocks()
})

describe('apply settings registration across harness generations', () => {
  it('uses ctx.settings.installSection when the service speaks the alpha API', () => {
    const installSection = vi.fn()
    const ctx = stubContext({ installSection })

    apply(ctx as never)

    expect(installSection).toHaveBeenCalledTimes(1)
    const call = installSection.mock.calls[0] ?? []
    expect(call[1]).toBe(PROMPT_ENHANCE_NAMESPACE)
    // namespace arrives as a plain string — the alpha service validates the
    // lowercase-hyphen grammar itself and no longer takes a branded wrapper.
    expect(typeof call[1]).toBe('string')
  })

  it('falls back to the standalone helpers when the service predates installSection', async () => {
    const legacy = await legacyModule()
    const ctx = stubContext({}) // rc-style service: no installSection

    apply(ctx as never)
    await vi.waitFor(() => expect(legacy.installSettingsSection).toHaveBeenCalledTimes(1))

    const call = legacy.installSettingsSection.mock.calls[0] ?? []
    expect(call[1]).toBe(PROMPT_ENHANCE_NAMESPACE)
  })

  it('registers nothing and still applies when no settings service ever mounts', async () => {
    const legacy = await legacyModule()
    const ctx = stubContext(undefined, false) // inject callback never fires

    expect(() => apply(ctx as never)).not.toThrow()
    await Promise.resolve()
    expect(legacy.installSettingsSection).not.toHaveBeenCalled()
  })
})

describe('lib/index.js load-time surface', () => {
  it('never statically imports the settings helpers removed in alpha', async () => {
    const { readFile } = await import('node:fs/promises')
    const { fileURLToPath } = await import('node:url')
    const path = fileURLToPath(new URL('../lib/index.js', import.meta.url))
    const source = await readFile(path, 'utf8')
    // A static named import of a removed export is a SyntaxError at module
    // evaluation, before any runtime probe could run — the dynamic import
    // below is the only allowed way to reach those names.
    expect(source).not.toMatch(/import\s*\{[^}]*installSettingsSection/)
    expect(source).not.toMatch(/import\s*\{[^}]*settingsNamespace/)
    expect(source).toMatch(/import\("@deepseek-ai\/dsh-settings"\)/)
  })
})
