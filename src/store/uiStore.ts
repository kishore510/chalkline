import { create } from 'zustand'
import type { DockingTarget } from '@/canvas/docking'
import type { Position } from '@/schema/diagram'
import { cleanRecents, pushRecent } from '@/editor/paletteModel'
import { useDiagramStore } from './diagramStore'
import { loadViewPrefs, saveViewPrefs, type GridDisplay, type ViewPrefs } from './viewPrefs'

export type Tool = 'select' | 'pan' | 'link'

export type LinkTapResult = 'source' | 'linked' | 'cleared' | 'refused' | 'ignored'

export type EdgeEnd = 'source' | 'target'

/** Auto-arrange and tidy choices, remembered between visits. */
export interface ArrangePrefs {
  direction: 'right' | 'down'
  spacing: 'compact' | 'normal' | 'roomy'
  clearPinned: boolean
}

const PREFS_KEY = 'chalkline.arrange'
const DEFAULT_PREFS: ArrangePrefs = { direction: 'right', spacing: 'normal', clearPinned: false }

function loadPrefs(): ArrangePrefs {
  try {
    const raw = JSON.parse(globalThis.localStorage?.getItem(PREFS_KEY) ?? 'null') as Partial<ArrangePrefs> | null
    return {
      direction: raw?.direction === 'down' ? 'down' : 'right',
      spacing: raw?.spacing === 'compact' || raw?.spacing === 'roomy' ? raw.spacing : 'normal',
      // "Also clear pinned sides" is deliberately not remembered: it's off by default every time.
      clearPinned: false,
    }
  } catch {
    return DEFAULT_PREFS
  }
}

function savePrefs(prefs: ArrangePrefs) {
  try {
    globalThis.localStorage?.setItem(PREFS_KEY, JSON.stringify({ direction: prefs.direction, spacing: prefs.spacing }))
  } catch {
    // Fine: the choice just isn't remembered.
  }
}

const RECENTS_KEY = 'chalkline.recentShapes'

function loadRecents(): string[] {
  try {
    return cleanRecents(JSON.parse(globalThis.localStorage?.getItem(RECENTS_KEY) ?? '[]'))
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

const initialView = loadViewPrefs()

const viewPrefsOf = (s: Pick<UiState, 'snapToGrid' | 'smartGuides' | 'gridDisplay'>): ViewPrefs => ({
  snapToGrid: s.snapToGrid,
  smartGuides: s.smartGuides,
  grid: s.gridDisplay,
})

export const useUiStore = create<UiState>()((set, get) => ({
  tool: 'select',
  linkSourceId: null,
  snapToGrid: initialView.snapToGrid,
  smartGuides: initialView.smartGuides,
  gridDisplay: initialView.grid,
  setViewPrefs(prefs) {
    const next = { ...viewPrefsOf(get()), ...prefs }
    saveViewPrefs(next)
    set({ snapToGrid: next.snapToGrid, smartGuides: next.smartGuides, gridDisplay: next.grid })
  },
  editingId: null,
  connecting: false,
  paletteOpen: false,
  layersOpen: false,
  setLayersOpen: (layersOpen) => set({ layersOpen }),
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
      try {
        globalThis.localStorage?.setItem(RECENTS_KEY, JSON.stringify(recentShapes))
      } catch {
        // Fine: just not remembered next time.
      }
      return { recentShapes }
    }),
  arrangePrefs: loadPrefs(),
  setArrangePrefs: (prefs) =>
    set((s) => {
      const arrangePrefs = { ...s.arrangePrefs, ...prefs }
      savePrefs(arrangePrefs)
      return { arrangePrefs }
    }),
  dismissNotice: () => set({ notice: null }),
  edgeDrag: null,
  dropTargetId: null,
  setDropTarget: (dropTargetId) => set((s) => (s.dropTargetId === dropTargetId ? s : { dropTargetId })),
  setEdgeDrag: (edgeDrag) => set({ edgeDrag }),
  focusLabelRequest: 0,
  requestLabelFocus: () => set((s) => ({ focusLabelRequest: s.focusLabelRequest + 1, contextMenu: null })),
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
