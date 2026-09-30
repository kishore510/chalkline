import { describe, expect, it } from 'vitest'
import { loadRightPanelCollapsed, RIGHT_PANEL_KEY, saveRightPanelCollapsed } from './panelPrefs'
import { useUiStore } from './uiStore'

function memory(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), data }
}

const throwing = {
  getItem: () => {
    throw new Error('blocked')
  },
  setItem: () => {
    throw new Error('blocked')
  },
}

describe('right panel collapsed preference', () => {
  it('defaults to expanded and round-trips through storage', () => {
    const storage = memory()
    expect(loadRightPanelCollapsed(storage)).toBe(false)
    saveRightPanelCollapsed(true, storage)
    expect(storage.data.get(RIGHT_PANEL_KEY)).toBe('{"collapsed":true}')
    expect(loadRightPanelCollapsed(storage)).toBe(true)
  })

  it('falls back to expanded when storage is missing, blocked or holds junk', () => {
    expect(loadRightPanelCollapsed(undefined)).toBe(false)
    expect(loadRightPanelCollapsed(throwing)).toBe(false)
    expect(loadRightPanelCollapsed(memory({ [RIGHT_PANEL_KEY]: '{not json' }))).toBe(false)
    expect(loadRightPanelCollapsed(memory({ [RIGHT_PANEL_KEY]: '{"collapsed":"yes"}' }))).toBe(false)
    expect(() => saveRightPanelCollapsed(true, throwing)).not.toThrow()
  })
})

describe('ui store', () => {
  it('expands the panel when a label field is asked for focus, so the request isn’t lost', () => {
    useUiStore.getState().setRightPanelCollapsed(true)
    expect(useUiStore.getState().rightPanelCollapsed).toBe(true)
    useUiStore.getState().requestLabelFocus()
    expect(useUiStore.getState().rightPanelCollapsed).toBe(false)
  })
})
