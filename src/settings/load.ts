import { readKey, removeKey, writeKey, type KeyValueStore } from '@/persistence/localStore'
import { STORAGE_KEYS } from '@/persistence/storageKeys'
import { readLegacyPrefs } from './legacy'
import { defaultSettings, parseSettings, parseSettingsText, SECTION_NAMES, type Settings } from './schema'

export const SETTINGS_KEY = STORAGE_KEYS.settings.key

export interface SettingsLoad {
  settings: Settings
  /** Old preference keys folded into settings on this load (empty after the first run). */
  migrated: string[]
  /** Old keys that were removed after migrating. */
  removed: string[]
}

/** Merges a partial set of sections into settings, then validates (bad values fall back). */
export function mergeSettings(base: Settings, patch: { [K in keyof Settings]?: Partial<Settings[K]> }): Settings {
  const next: Record<string, unknown> = { ...base }
  for (const name of SECTION_NAMES) {
    const part = patch[name]
    if (part) next[name] = { ...base[name], ...part }
  }
  return parseSettings(next)
}

/**
 * Loads settings. On the first run of this version there is no settings key
 * yet: old preference keys are folded in, written under the new key, and the
 * old keys removed only once that write has succeeded (and reads back).
 * Someone with old preferences or an autosave is not a first-time visitor.
 */
export function loadSettings(storage: KeyValueStore | undefined): SettingsLoad {
  const text = readKey(SETTINGS_KEY, storage)
  if (text !== null) return { settings: parseSettingsText(text), migrated: [], removed: [] }

  const legacy = readLegacyPrefs(storage)
  const returning = legacy.found.length > 0 || readKey(STORAGE_KEYS.autosave.key, storage) !== null
  const settings = mergeSettings(defaultSettings(), { ...legacy.patch, ...(returning && { onboarding: { firstRunDone: true } }) })
  if (!returning) return { settings, migrated: [], removed: [] }

  const serialized = JSON.stringify(settings)
  const written = writeKey(SETTINGS_KEY, serialized, storage) === 'ok' && readKey(SETTINGS_KEY, storage) === serialized
  const removed = written ? legacy.found.filter((key) => removeKey(key, storage)) : []
  return { settings, migrated: legacy.found, removed }
}
