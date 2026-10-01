export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const
export type ThemePreference = (typeof THEME_PREFERENCES)[number]
export type Theme = 'light' | 'dark'

export function parsePreference(value: unknown): ThemePreference {
  return THEME_PREFERENCES.includes(value as ThemePreference) ? (value as ThemePreference) : 'system'
}

export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): Theme {
  if (preference === 'system') return systemPrefersDark ? 'dark' : 'light'
  return preference
}

/** Cycle order for a single toggle button: system -> light -> dark -> system. */
export function nextPreference(preference: ThemePreference): ThemePreference {
  const index = THEME_PREFERENCES.indexOf(preference)
  return THEME_PREFERENCES[(index + 1) % THEME_PREFERENCES.length]!
}

/**
 * The stored preference, from settings text (or, before migration, the old
 * one-word theme key). Mirrored by the inline script in index.html, which
 * applies the theme before first paint; a test keeps the two in step.
 */
export function storedPreference(settingsText: string | null, legacyText: string | null): ThemePreference {
  if (settingsText === null) return parsePreference(legacyText)
  try {
    return parsePreference((JSON.parse(settingsText) as { appearance?: { theme?: unknown } } | null)?.appearance?.theme)
  } catch {
    return 'system'
  }
}
