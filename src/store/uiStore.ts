import { create } from 'zustand'
import type { DockingTarget } from '@/canvas/docking'
import type { Position } from '@/schema/diagram'
import { useDiagramStore } from './diagramStore'

export type Tool = 'select' | 'pan' | 'link'

export type LinkTapResult = 'source' | 'linked' | 'cleared' | 'refused' | 'ignored'

export type EdgeEnd = 'source' | 'target'

export interface ContextMenuState {
  /** Viewport coordinates of the pointer that opened the menu. */
  x: number
  y: number
  /** The element that was pressed. */
  id: string
  /** 'grip' is the end grip of a selected connector; `end` says which one. */
  kind: 'node' | 'edge' | 'grip'
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
  /** Node whose label is being edited inline, if any. */
  editingId: string | null
  /** True while a connector is being dragged, so every handle shows as a target. */
  connecting: boolean
  paletteOpen: boolean
  contextMenu: ContextMenuState | null
  edgeDrag: EdgeDrag | null
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

export const useUiStore = create<UiState>()((set, get) => ({
  tool: 'select',
  linkSourceId: null,
  snapToGrid: true,
  editingId: null,
  connecting: false,
  paletteOpen: false,
  contextMenu: null,
  edgeDrag: null,
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
  toggleSnap: () => set((s) => ({ snapToGrid: !s.snapToGrid })),
  setEditing: (editingId) => set({ editingId, contextMenu: null }),
  setConnecting: (connecting) => set({ connecting }),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  openContextMenu: (contextMenu) => set({ contextMenu }),
  closeContextMenu: () => set({ contextMenu: null }),
}))
