/**
 * Browser-side mirror of the plugin settings. The client bundle never
 * imports the host config module (it pulls schemastery into the browser),
 * so this module re-declares the three fields the UI reads, with the same
 * defaults, and re-exports them as a subscribable store fed by the bound
 * settings scope.
 * @module dsh-prompt-enhance/client/settings
 */

/** The settings subset the browser UI consumes (mirror of the host defaults). */
export interface ClientSettings {
  enabled: boolean
  maxInputChars: number
  shortcut: string
}

/** Defaults mirroring the host `DEFAULT_CONFIG`. */
export const DEFAULT_CLIENT_SETTINGS: ClientSettings = {
  enabled: true,
  maxInputChars: 12000,
  shortcut: 'ctrl+alt+e',
}

const listeners = new Set<() => void>()
let current: ClientSettings = DEFAULT_CLIENT_SETTINGS

/**
 * Replace the effective settings (called by the scope subscription).
 * @param next - the freshly read section.
 */
export function setClientSettings(next: ClientSettings): void {
  current = next
  for (const listener of listeners) listener()
}

/** The currently effective client settings. */
export function getClientSettings(): ClientSettings {
  return current
}

/**
 * Subscribe to settings replacements.
 * @param listener - notified after each replacement.
 * @returns the unsubscribe function.
 */
export function subscribeClientSettings(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Decode one wire section into client settings, falling back field-by-field
 * to the defaults. Used as the bound scope's `decode`.
 * @param section - the schema-resolved namespace section (untrusted).
 * @returns the narrowed settings.
 */
export function decodeClientSettings(section: unknown): ClientSettings {
  const record = section as Partial<Record<keyof ClientSettings, unknown>> | null
  if (record === null || typeof record !== 'object') return DEFAULT_CLIENT_SETTINGS
  return {
    enabled: typeof record.enabled === 'boolean' ? record.enabled : DEFAULT_CLIENT_SETTINGS.enabled,
    maxInputChars: typeof record.maxInputChars === 'number' && Number.isFinite(record.maxInputChars) && record.maxInputChars > 0
      ? Math.floor(record.maxInputChars)
      : DEFAULT_CLIENT_SETTINGS.maxInputChars,
    shortcut: typeof record.shortcut === 'string' ? record.shortcut : DEFAULT_CLIENT_SETTINGS.shortcut,
  }
}
