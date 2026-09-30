import { describe, expect, it } from 'vitest'
import { clampPaletteWidth, DEFAULT_PALETTE_PREFS, loadPalettePrefs, maxPaletteWidth, PALETTE_PREFS_KEY, savePalettePrefs, shouldCollapse } from './paletteWidth'

function memory(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) }
}

const blocked = {
  getItem: () => {
    throw new Error('blocked')
  },
  setItem: () => {
    throw new Error('blocked')
  },
}

describe('palette preferences', () => {
  it('defaults to the token width, expanded', () => {
    expect(loadPalettePrefs(memory())).toEqual({ width: null, collapsed: false })
  })

  it('round-trips width and collapsed state', () => {
    const storage = memory()
    savePalettePrefs({ width: 320, collapsed: true }, storage)
    expect(loadPalettePrefs(storage)).toEqual({ width: 320, collapsed: true })
  })

  it('falls back safely on blocked storage or junk', () => {
    expect(loadPalettePrefs(blocked)).toEqual(DEFAULT_PALETTE_PREFS)
    expect(loadPalettePrefs(memory({ [PALETTE_PREFS_KEY]: '{oops' }))).toEqual(DEFAULT_PALETTE_PREFS)
    expect(loadPalettePrefs(memory({ [PALETTE_PREFS_KEY]: JSON.stringify({ width: -5, collapsed: 'yes' }) }))).toEqual(DEFAULT_PALETTE_PREFS)
    expect(() => savePalettePrefs(DEFAULT_PALETTE_PREFS, blocked)).not.toThrow()
  })
})

describe('palette width', () => {
  it('clamps to the minimum and maximum', () => {
    expect(clampPaletteWidth(100, 200, 480)).toBe(200)
    expect(clampPaletteWidth(900, 200, 480)).toBe(480)
    expect(clampPaletteWidth(300.4, 200, 480)).toBe(300)
  })

  it('never takes more than 40% of the window, nor goes under the minimum', () => {
    expect(maxPaletteWidth(200, 480, 1920)).toBe(480)
    expect(maxPaletteWidth(200, 480, 1024)).toBe(409)
    expect(maxPaletteWidth(200, 480, 400)).toBe(200)
  })

  it('collapses when released well below the minimum', () => {
    expect(shouldCollapse(180, 200)).toBe(false)
    expect(shouldCollapse(120, 200)).toBe(true)
  })
})
