import { create } from 'zustand'
import type { DockingTarget } from '@/canvas/docking'
import type { Position } from '@/schema/diagram'
import { cleanRecents, pushRecent } from '@/editor/paletteModel'
import { useDiagramStore } from './diagramStore'
import { readKey, writeKey } from '@/persistence/localStore'
import { STORAGE_KEYS } from '@/persistence/storageKeys'
import type { GridDisplay } from '@/settings/schema'
import { getSettings, updateSettings, useSettingsStore } from '@/settings/settingsStore'

export type Tool = 'select' | 'pan' | 'link'

export type LinkTapResult = 'source' | 'linked' | 'cleared' | 'refused' | 'ignored'

export type EdgeEnd = 'source' | 'target'

/** Auto-arrange and tidy choices; direction and spacing are remembered in settings. */
export interface ArrangePrefs {
  direction: 'right' | 'down'
  spacing: 'compact' | 'normal' | 'roomy'
  clearPinned: boolean
}

/** View preferences: how the canvas behaves and looks for this person (kept in settings). */
export interface ViewPrefs {
  snapToGrid: boolean
  smartGuides: boolean
  /** Only changes what's drawn; snapping is separate. */
  grid: GridDisplay
}

const RECENTS_KEY = STORAGE_KEYS.recentShapes.key

function loadRecents(): string[] {
  try {
    return cleanRecents(JSON.parse(readKey(RECENTS_KEY) ?? '[]'))
  } catch {
    return []
  }
}

/** Autosave state, shown in the file menu. */
export type SaveStatus = 'off' | 'saved' | 'error'

export interface ContextMenuState {
  /** Viewport coordinates of the pointer that opened the menu. */
  x: number
  y: number
  /** The element that was pressed. */
  id: string
  /** 'grip' is the end grip of a selected connector; `end` says which one. */
  kind: 'node' | 'edge' | 'grip' | 'pane' | 'group'
  end?: EdgeEnd
}

/** A connector end being dragged to another docking point (live preview only; not saved). */
export interface EdgeDrag {
  edgeId: string
  end: EdgeEnd
  /** Pointer position in flow coordinates. */
  point: Position
  /** The docking point it would attach to if released now. */
  target: DockingTarget | null
}

/** Editor state that is not part of the saved document. */
interface UiState {
  tool: Tool
  /** Link mode: the node tapped first, waiting for a target. */
  linkSourceId: string | null
  snapToGrid: boolean
  /** Alignment and spacing guides while dragging or resizing. */
  smartGuides: boolean
  gridDisplay: GridDisplay
  /** Changes view preferences (snap, guides, grid display) and remembers them. */
  setViewPrefs: (prefs: Partial<ViewPrefs>) => void
  /** Node whose label is being edited inline, if any. */
  editingId: string | null
  /** True while a connector is being dragged, so every handle shows as a target. */
  connecting: boolean
  paletteOpen: boolean
  /** Layers panel: a tab of the right panel on desktop, a sheet on phone and tablet. */
  layersOpen: boolean
  setLayersOpen: (open: boolean) => void
  /** Desktop: the right panel is collapsed to a rail (remembered). */
  rightPanelCollapsed: boolean
  setRightPanelCollapsed: (collapsed: boolean) => void
  contextMenu: ContextMenuState | null
  saveStatus: SaveStatus
  setSaveStatus: (status: SaveStatus) => void
  /** A short message shown briefly at the bottom of the canvas, optionally with one action. `id` changes each time. */
  notice: { id: number; text: string; action?: { label: string; run: () => void } } | null
  notify: (text: string, action?: { label: string; run: () => void }) => void
  /** Long-running work (e.g. auto-arrange); shown as a busy indicator. */
  busy: string | null
  setBusy: (busy: string | null) => void
  /** True briefly after auto-arrange, so shapes glide to their new places. */
  animating: boolean
  setAnimating: (animating: boolean) => void
  /** Shapes added most recently, newest first (shown as a row in the phone palette). */
  recentShapes: string[]
  noteShapeUsed: (id: string) => void
  arrangePrefs: ArrangePrefs
  setArrangePrefs: (prefs: Partial<ArrangePrefs>) => void
  dismissNotice: () => void
  edgeDrag: EdgeDrag | null
  /** Group a dragged node would join if dropped now (drop feedback). */
  dropTargetId: string | null
  setDropTarget: (id: string | null) => void
  setEdgeDrag: (drag: EdgeDrag | null) => void
  /** Bumped to ask the properties panel to focus its label field (e.g. double-click on an edge). */
  focusLabelRequest: number
  requestLabelFocus: () => void
  setTool: (tool: Tool) => void
  /** Link mode: first tap picks the source, second tap on another node creates the edge. */
  linkTap: (nodeId: string) => LinkTapResult
  clearLinkSource: () => void
  toggleSnap: () => void
  setEditing: (id: string | null) => void
  setConnecting: (connecting: boolean) => void
  setPaletteOpen: (open: boolean) => void
  openContextMenu: (menu: ContextMenuState) => void
  closeContextMenu: () => void
}

/** The parts of UI state that mirror settings (settings are the source of truth). */
function fromSettings() {
  const { canvas, arrange, panels } = getSettings()
  return {
    snapToGrid: canvas.snapToGrid,
    smartGuides: canvas.smartGuides,
    gridDisplay: canvas.grid,
    rightPanelCollapsed: panels.rightCollapsed,
    direction: arrange.direction,
    spacing: arrange.spacing,
  }
}

const initial = fromSettings()

export const useUiStore = create<UiState>()((set, get) => ({
  tool: 'select',
  linkSourceId: null,
  snapToGrid: initial.snapToGrid,
  smartGuides: initial.smartGuides,
  gridDisplay: initial.gridDisplay,
  setViewPrefs: (prefs) => updateSettings({ canvas: prefs }),
  editingId: null,
  connecting: false,
  paletteOpen: false,
  layersOpen: false,
  setLayersOpen: (layersOpen) => set({ layersOpen }),
  rightPanelCollapsed: initial.rightPanelCollapsed,
  setRightPanelCollapsed: (rightCollapsed) => updateSettings({ panels: { rightCollapsed } }),
  contextMenu: null,
  saveStatus: 'off',
  setSaveStatus: (saveStatus) => set({ saveStatus }),
  notice: null,
  notify: (text, action) => set((s) => ({ notice: { id: (s.notice?.id ?? 0) + 1, text, ...(action && { action }) } })),
  busy: null,
  setBusy: (busy) => set({ busy }),
  animating: false,
  setAnimating: (animating) => set({ animating }),
  recentShapes: loadRecents(),
  noteShapeUsed: (id) =>
    set((s) => {
      const recentShapes = pushRecent(s.recentShapes, id)
      // If storage refuses, the list just isn't remembered next time.
      writeKey(RECENTS_KEY, JSON.stringify(recentShapes))
      return { recentShapes }
    }),
  // "Also clear pinned sides" is deliberately not remembered: it's off by default every time.
  arrangePrefs: { direction: initial.direction, spacing: initial.spacing, clearPinned: false },
  setArrangePrefs({ clearPinned, ...remembered }) {
    if (clearPinned !== undefined) set((s) => ({ arrangePrefs: { ...s.arrangePrefs, clearPinned } }))
    if (Object.keys(remembered).length) updateSettings({ arrange: remembered })
  },
  dismissNotice: () => set({ notice: null }),
  edgeDrag: null,
  dropTargetId: null,
  setDropTarget: (dropTargetId) => set((s) => (s.dropTargetId === dropTargetId ? s : { dropTargetId })),
  setEdgeDrag: (edgeDrag) => set({ edgeDrag }),
  focusLabelRequest: 0,
  requestLabelFocus() {
    // The label field lives in the right panel on desktop, so bring it back if collapsed.
    if (get().rightPanelCollapsed) get().setRightPanelCollapsed(false)
    set((s) => ({ focusLabelRequest: s.focusLabelRequest + 1, contextMenu: null, layersOpen: false }))
  },
  setTool(tool) {
    // Link mode taps nodes to connect them, so an existing selection would only get in the way.
    if (tool === 'link') useDiagramStore.getState().setSelection([])
    set({ tool, linkSourceId: null, contextMenu: null, edgeDrag: null })
  },
  linkTap(nodeId) {
    const { tool, linkSourceId } = get()
    if (tool !== 'link') return 'ignored'
    const diagram = useDiagramStore.getState()
    const sourceExists = linkSourceId !== null && diagram.diagram.nodes.some((n) => n.id === linkSourceId)
    if (!sourceExists) {
      set({ linkSourceId: nodeId })
      return 'source'
    }
    if (linkSourceId === nodeId) {
      set({ linkSourceId: null })
      return 'cleared'
    }
    const id = diagram.linkNodes(linkSourceId, nodeId)
    set({ linkSourceId: null })
    return id ? 'linked' : 'refused'
  },
  clearLinkSource: () => set({ linkSourceId: null }),
  toggleSnap: () => get().setViewPrefs({ snapToGrid: !get().snapToGrid }),
  setEditing: (editingId) => set({ editingId, contextMenu: null }),
  setConnecting: (connecting) => set({ connecting }),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  openContextMenu: (contextMenu) => set({ contextMenu }),
  closeContextMenu: () => set({ contextMenu: null }),
}))

// Settings are the source of truth for these; the UI store mirrors them for its many readers.
useSettingsStore.subscribe((state, previous) => {
  if (state.settings === previous.settings) return
  const next = fromSettings()
  useUiStore.setState((s) => ({
    snapToGrid: next.snapToGrid,
    smartGuides: next.smartGuides,
    gridDisplay: next.gridDisplay,
    rightPanelCollapsed: next.rightPanelCollapsed,
    arrangePrefs:
      s.arrangePrefs.direction === next.direction && s.arrangePrefs.spacing === next.spacing ? s.arrangePrefs : { ...s.arrangePrefs, direction: next.direction, spacing: next.spacing },
  }))
})
