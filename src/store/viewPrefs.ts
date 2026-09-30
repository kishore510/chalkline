/*
 * View preferences: how the canvas behaves and looks for this person, not
 * part of the diagram. Remembered in browser storage when it's available.
 */

export type GridDisplay = 'dots' | 'lines' | 'off'

export interface ViewPrefs {
  snapToGrid: boolean
  smartGuides: boolean
  /** Only changes what's drawn; snapping is separate. */
  grid: GridDisplay
}

export const VIEW_PREFS_KEY = 'chalkline.view'
export const DEFAULT_VIEW_PREFS: ViewPrefs = { snapToGrid: true, smartGuides: true, grid: 'dots' }

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>
const defaultStorage = (): Storage | undefined => globalThis.localStorage

/** Stored preferences, with defaults for anything missing or unreadable. */
export function loadViewPrefs(storage: Storage | undefined = defaultStorage()): ViewPrefs {
  try {
    const raw = JSON.parse(storage?.getItem(VIEW_PREFS_KEY) ?? 'null') as Partial<Record<keyof ViewPrefs, unknown>> | null
    return {
      snapToGrid: typeof raw?.snapToGrid === 'boolean' ? raw.snapToGrid : DEFAULT_VIEW_PREFS.snapToGrid,
      smartGuides: typeof raw?.smartGuides === 'boolean' ? raw.smartGuides : DEFAULT_VIEW_PREFS.smartGuides,
      grid: raw?.grid === 'lines' || raw?.grid === 'off' || raw?.grid === 'dots' ? raw.grid : DEFAULT_VIEW_PREFS.grid,
    }
  } catch {
    return DEFAULT_VIEW_PREFS
  }
}

export function saveViewPrefs(prefs: ViewPrefs, storage: Storage | undefined = defaultStorage()) {
  try {
    storage?.setItem(VIEW_PREFS_KEY, JSON.stringify(prefs))
  } catch {
    // Fine: the choice just isn't remembered.
  }
}
