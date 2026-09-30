/*
 * Desktop palette width and collapsed state, remembered in browser storage
 * when it's available. Not part of the diagram.
 */

export interface PalettePrefs {
  /** Width in CSS px; null means the default from the --cl-palette-width token. */
  width: number | null
  collapsed: boolean
}

export const PALETTE_PREFS_KEY = 'chalkline.palette'
export const DEFAULT_PALETTE_PREFS: PalettePrefs = { width: null, collapsed: false }

/** The palette may take at most this share of the window, so the canvas keeps room. */
export const MAX_WINDOW_SHARE = 0.4
/** Dragging this far below the minimum width collapses the palette on release. */
export const COLLAPSE_SLACK = 64

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>
const defaultStorage = (): Storage | undefined => globalThis.localStorage

export function loadPalettePrefs(storage: Storage | undefined = defaultStorage()): PalettePrefs {
  try {
    const raw = JSON.parse(storage?.getItem(PALETTE_PREFS_KEY) ?? 'null') as Partial<Record<keyof PalettePrefs, unknown>> | null
    return {
      width: typeof raw?.width === 'number' && Number.isFinite(raw.width) && raw.width > 0 ? raw.width : null,
      collapsed: raw?.collapsed === true,
    }
  } catch {
    return DEFAULT_PALETTE_PREFS
  }
}

export function savePalettePrefs(prefs: PalettePrefs, storage: Storage | undefined = defaultStorage()) {
  try {
    storage?.setItem(PALETTE_PREFS_KEY, JSON.stringify(prefs))
  } catch {
    // Fine: the width just isn't remembered.
  }
}

/** The widest the palette may be: the token maximum, or a share of the window, but never under the minimum. */
export const maxPaletteWidth = (min: number, max: number, windowWidth: number) => Math.max(min, Math.min(max, Math.floor(windowWidth * MAX_WINDOW_SHARE)))

export const clampPaletteWidth = (width: number, min: number, max: number) => Math.round(Math.min(max, Math.max(min, width)))

/** Released well below the minimum: collapse instead of resizing. */
export const shouldCollapse = (width: number, min: number) => width < min - COLLAPSE_SLACK
