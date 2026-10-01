import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { nextPreference, parsePreference, resolveTheme, storedPreference } from './theme'

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

  it('reads the stored preference from settings, else the old theme key', () => {
    expect(storedPreference(JSON.stringify({ appearance: { theme: 'dark' } }), 'light')).toBe('dark')
    expect(storedPreference(null, 'light')).toBe('light')
    // Unreadable settings mean default settings, as in the app.
    expect(storedPreference('{oops', 'dark')).toBe('system')
    expect(storedPreference(JSON.stringify({ appearance: { theme: 'neon' } }), null)).toBe('system')
    expect(storedPreference(null, null)).toBe('system')
  })

  it('the first-paint script in index.html reads the same keys', () => {
    const html = readFileSync(join(import.meta.dirname, '..', '..', 'index.html'), 'utf8')
    expect(html).toContain("localStorage.getItem('chalkline.settings')")
    expect(html).toContain("localStorage.getItem('chalkline.theme')")
    expect(html).toContain('appearance')
  })
})
