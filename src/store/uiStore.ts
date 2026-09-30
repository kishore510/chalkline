import { create } from 'zustand'

export type Tool = 'select' | 'pan'

export interface ContextMenuState {
  /** Viewport coordinates of the pointer that opened the menu. */
  x: number
  y: number
  /** The element that was pressed. */
  id: string
  kind: 'node' | 'edge'
}

/** Editor state that is not part of the saved document. */
interface UiState {
  tool: Tool
  snapToGrid: boolean
  /** Node whose label is being edited inline, if any. */
  editingId: string | null
  /** True while a connector is being dragged, so every handle shows as a target. */
  connecting: boolean
  paletteOpen: boolean
  contextMenu: ContextMenuState | null
  /** Bumped to ask the properties panel to focus its label field (e.g. double-click on an edge). */
  focusLabelRequest: number
  requestLabelFocus: () => void
  setTool: (tool: Tool) => void
  toggleSnap: () => void
  setEditing: (id: string | null) => void
  setConnecting: (connecting: boolean) => void
  setPaletteOpen: (open: boolean) => void
  openContextMenu: (menu: ContextMenuState) => void
  closeContextMenu: () => void
}

export const useUiStore = create<UiState>()((set) => ({
  tool: 'select',
  snapToGrid: true,
  editingId: null,
  connecting: false,
  paletteOpen: false,
  contextMenu: null,
  focusLabelRequest: 0,
  requestLabelFocus: () => set((s) => ({ focusLabelRequest: s.focusLabelRequest + 1, contextMenu: null })),
  setTool: (tool) => set({ tool }),
  toggleSnap: () => set((s) => ({ snapToGrid: !s.snapToGrid })),
  setEditing: (editingId) => set({ editingId, contextMenu: null }),
  setConnecting: (connecting) => set({ connecting }),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  openContextMenu: (contextMenu) => set({ contextMenu }),
  closeContextMenu: () => set({ contextMenu: null }),
}))
