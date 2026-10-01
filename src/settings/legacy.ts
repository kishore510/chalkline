import { parsePreference } from '@/lib/theme'
import { readKey } from '@/persistence/localStore'
import { STORAGE_KEYS } from '@/persistence/storageKeys'
import type { Settings } from './schema'

/*
 * Preferences as versions up to 0.19 stored them: one key each. Read once on
 * the first run of this version, folded into settings, then removed (only
 * after the new settings were written successfully).
 */

type Reader = Pick<Storage, 'getItem'>
type Patch = { [K in keyof Settings]?: Partial<Settings[K]> }

const json = (text: string | null): Record<string, unknown> | null => {
  if (text === null) return null
  try {
    const value: unknown = JSON.parse(text)
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export interface LegacyResult {
  /** Settings found in the old keys (sections and fields that were there). */
  patch: Patch
  /** Old keys that were present, valid or not; all are removed after migrating. */
  found: string[]
}

/** Reads every old preference key. Unreadable values are skipped (defaults apply). */
export function readLegacyPrefs(storage: Reader | undefined): LegacyResult {
  const found: string[] = []
  const read = (key: string) => {
    const text = readKey(key, storage)
    if (text !== null) found.push(key)
    return text
  }
  const patch: Patch = {}

  const theme = read(STORAGE_KEYS.legacyTheme.key)
  if (theme !== null) patch.appearance = { theme: parsePreference(theme) }

  const view = json(read(STORAGE_KEYS.legacyView.key))
  if (view) {
    patch.canvas = {}
    if (typeof view.snapToGrid === 'boolean') patch.canvas.snapToGrid = view.snapToGrid
    if (typeof view.smartGuides === 'boolean') patch.canvas.smartGuides = view.smartGuides
    if (view.grid === 'dots' || view.grid === 'lines' || view.grid === 'off') patch.canvas.grid = view.grid
  }

  const arrange = json(read(STORAGE_KEYS.legacyArrange.key))
  if (arrange) {
    patch.arrange = {}
    if (arrange.direction === 'right' || arrange.direction === 'down') patch.arrange.direction = arrange.direction
    if (arrange.spacing === 'compact' || arrange.spacing === 'normal' || arrange.spacing === 'roomy') patch.arrange.spacing = arrange.spacing
  }

  const right = json(read(STORAGE_KEYS.legacyRightPanel.key))
  const palette = json(read(STORAGE_KEYS.legacyPalette.key))
  if (right || palette) {
    patch.panels = {}
    if (typeof right?.collapsed === 'boolean') patch.panels.rightCollapsed = right.collapsed
    if (typeof palette?.collapsed === 'boolean') patch.panels.paletteCollapsed = palette.collapsed
    if (typeof palette?.width === 'number' && Number.isFinite(palette.width) && palette.width > 0) patch.panels.paletteWidth = palette.width
  }

  return { patch, found }
}
