import { describe, expect, it } from 'vitest'
import { DEFAULT_VIEW_PREFS, loadViewPrefs, saveViewPrefs, VIEW_PREFS_KEY } from './viewPrefs'

function memory(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) }
}

const throwing = {
  getItem: () => {
    throw new Error('blocked')
  },
  setItem: () => {
    throw new Error('blocked')
  },
}

describe('view preferences', () => {
  it('defaults: snap on, smart guides on, dotted grid', () => {
    expect(loadViewPrefs(memory())).toEqual({ snapToGrid: true, smartGuides: true, grid: 'dots' })
  })

  it('round-trips through storage', () => {
    const storage = memory()
    saveViewPrefs({ snapToGrid: false, smartGuides: false, grid: 'lines' }, storage)
    expect(loadViewPrefs(storage)).toEqual({ snapToGrid: false, smartGuides: false, grid: 'lines' })
  })

  it('falls back safely when storage is empty, blocked or holds junk', () => {
    expect(loadViewPrefs(throwing)).toEqual(DEFAULT_VIEW_PREFS)
    expect(loadViewPrefs(memory({ [VIEW_PREFS_KEY]: '{not json' }))).toEqual(DEFAULT_VIEW_PREFS)
    expect(loadViewPrefs(memory({ [VIEW_PREFS_KEY]: '42' }))).toEqual(DEFAULT_VIEW_PREFS)
    expect(() => saveViewPrefs(DEFAULT_VIEW_PREFS, throwing)).not.toThrow()
  })

  it('keeps valid fields and defaults the rest', () => {
    const storage = memory({ [VIEW_PREFS_KEY]: JSON.stringify({ grid: 'off', smartGuides: 'yes' }) })
    expect(loadViewPrefs(storage)).toEqual({ snapToGrid: true, smartGuides: true, grid: 'off' })
  })
})
