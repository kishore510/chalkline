import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { nextPreference, resolveTheme, type Theme, type ThemePreference } from '@/lib/theme'
import { updateSettings, useSettingsStore } from '@/settings/settingsStore'

const DARK_QUERY = '(prefers-color-scheme: dark)'

function useSystemDark() {
  return useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia(DARK_QUERY)
      media.addEventListener('change', onChange)
      return () => media.removeEventListener('change', onChange)
    },
    () => window.matchMedia(DARK_QUERY).matches,
    () => false,
  )
}

/** Current theme preference (from settings), applied to <html data-theme> and kept in sync with the OS. */
export function useTheme() {
  const preference = useSettingsStore((s) => s.settings.appearance.theme)
  const theme: Theme = resolveTheme(preference, useSystemDark())

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  const set = useCallback((next: ThemePreference) => updateSettings({ appearance: { theme: next } }), [])
  const cycle = useCallback(() => set(nextPreference(useSettingsStore.getState().settings.appearance.theme)), [set])

  return { preference, theme, set, cycle }
}
