import { describe, expect, it } from 'vitest'
import { loadPreference, nextPreference, parsePreference, resolveTheme, savePreference, THEME_STORAGE_KEY } from './theme'

describe('theme', () => {
  it('parses known preferences and falls back to system', () => {
    expect(parsePreference('dark')).toBe('dark')
    expect(parsePreference('light')).toBe('light')
    expect(parsePreference('system')).toBe('system')
    expect(parsePreference('purple')).toBe('system')
    expect(parsePreference(null)).toBe('system')
  })

  it('resolves system preference from the media query', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })

  it('cycles system -> light -> dark -> system', () => {
    expect(nextPreference('system')).toBe('light')
    expect(nextPreference('light')).toBe('dark')
    expect(nextPreference('dark')).toBe('system')
  })

  it('round-trips through storage', () => {
    const store = new Map<string, string>()
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) }
    savePreference('dark', storage)
    expect(store.get(THEME_STORAGE_KEY)).toBe('dark')
    expect(loadPreference(storage)).toBe('dark')
  })

  it('survives storage that throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }
    expect(loadPreference(broken)).toBe('system')
    expect(() => savePreference('light', broken)).not.toThrow()
    expect(loadPreference(undefined)).toBe('system')
  })
})
