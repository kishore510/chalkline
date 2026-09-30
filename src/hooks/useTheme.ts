import { useCallback, useEffect, useState } from 'react'
import { loadPreference, nextPreference, resolveTheme, savePreference, type Theme, type ThemePreference } from '@/lib/theme'

const DARK_QUERY = '(prefers-color-scheme: dark)'

/** Current theme preference, applied to <html data-theme> and kept in sync with the OS. */
export function useTheme() {
  const [preference, setPreference] = useState<ThemePreference>(() => loadPreference())
  const [systemDark, setSystemDark] = useState(() => window.matchMedia(DARK_QUERY).matches)
  const theme: Theme = resolveTheme(preference, systemDark)

  useEffect(() => {
    const media = window.matchMedia(DARK_QUERY)
    const onChange = () => setSystemDark(media.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  const cycle = useCallback(() => {
    setPreference((current) => {
      const next = nextPreference(current)
      savePreference(next)
      return next
    })
  }, [])

  return { preference, theme, cycle }
}
