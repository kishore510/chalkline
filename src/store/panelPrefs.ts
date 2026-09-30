/*
 * Whether the desktop right panel (Properties and Layers) is collapsed to a
 * rail. Remembered in browser storage when it's available; not part of the diagram.
 */

export const RIGHT_PANEL_KEY = 'chalkline.rightPanel'

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>
const defaultStorage = (): Storage | undefined => globalThis.localStorage

export function loadRightPanelCollapsed(storage: Storage | undefined = defaultStorage()): boolean {
  try {
    const raw = JSON.parse(storage?.getItem(RIGHT_PANEL_KEY) ?? 'null') as { collapsed?: unknown } | null
    return raw?.collapsed === true
  } catch {
    return false
  }
}

export function saveRightPanelCollapsed(collapsed: boolean, storage: Storage | undefined = defaultStorage()) {
  try {
    storage?.setItem(RIGHT_PANEL_KEY, JSON.stringify({ collapsed }))
  } catch {
    // Fine: the choice just isn't remembered.
  }
}
