import { create } from 'zustand'
import { appStorage, writeKey, type WriteResult } from '@/persistence/localStore'
import { loadSettings, mergeSettings, SETTINGS_KEY, type SettingsLoad } from './load'
import type { Settings } from './schema'

/*
 * The app's settings, in memory and in browser storage. Changes apply at once
 * and are remembered when storage allows; if it doesn't, they still apply for
 * this visit. Not part of the diagram, not an undo step.
 */

type SettingsPatch = { [K in keyof Settings]?: Partial<Settings[K]> }

interface SettingsState {
  settings: Settings
  /** Result of the last write: 'ok', or why settings couldn't be remembered. */
  lastWrite: WriteResult
  /** Changes some fields of one or more sections. Invalid values fall back to defaults. */
  update: (patch: SettingsPatch) => void
}

/** What the first load did (old preferences migrated), for diagnostics and tests. */
export let settingsLoad: SettingsLoad = { settings: undefined as never, migrated: [], removed: [] }

function initial(): Settings {
  settingsLoad = loadSettings(appStorage())
  return settingsLoad.settings
}

export const useSettingsStore = create<SettingsState>()((set, get) => ({
  settings: initial(),
  lastWrite: 'ok',
  update(patch) {
    const settings = mergeSettings(get().settings, patch)
    set({ settings, lastWrite: writeKey(SETTINGS_KEY, JSON.stringify(settings)) })
  },
}))

export const getSettings = () => useSettingsStore.getState().settings
export const updateSettings = (patch: SettingsPatch) => useSettingsStore.getState().update(patch)
