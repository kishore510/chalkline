import { MarkerType, type Edge, type EdgeChange, type EdgeMarker, type Node, type NodeChange } from '@xyflow/react'
import type { Diagram, DiagramEdge, DiagramNode, EdgeStyle, NodeStyle, NodeType, Position, Size } from '@/schema/diagram'
import { edgeAppearance } from './appearance'
import type { Route } from './routing'
import type { Spread } from './spread'
import { HANDLE_SIDES, type HandleSide } from './handles'

const isSide = (value: string | undefined): value is HandleSide => HANDLE_SIDES.includes(value as HandleSide)

/*
 * Pure translation between the diagram document and React Flow. The store is
 * the source of truth; React Flow renders these objects and reports changes,
 * which are turned back into store operations here.
 */

type Arrowhead = NonNullable<EdgeStyle['endArrow']>

export type ShapeNodeData = { type: NodeType; label: string; style: NodeStyle; hasNotes: boolean; locked: boolean }
export type ShapeFlowNode = Node<ShapeNodeData, 'shape'>

export type LineType = NonNullable<EdgeStyle['lineType']>
/**
 * Edge data. Sides come from the router (pinned sides unchanged, auto sides
 * chosen around obstacles); a missing side is chosen at render time. `detour`
 * is a routed polyline to follow instead of the line type's own path.
 */
export type FloatingEdgeData = {
  lineType: LineType
  sourceSide?: HandleSide
  targetSide?: HandleSide
  detour?: Position[]
  /** Offsets along the side, so connectors sharing a side don't stack (see spread.ts). */
  sourceShift?: number
  targetShift?: number
}
export type FloatingFlowEdge = Edge<FloatingEdgeData, 'floating'>

/** Rendering defaults for optional edge style fields. */
export const EDGE_DEFAULTS = {
  lineType: 'smoothstep',
  startArrow: 'none',
  endArrow: 'arrow',
} as const satisfies Required<Pick<EdgeStyle, 'lineType' | 'startArrow' | 'endArrow'>>


/**
 * Builds React Flow nodes, reusing the previous object when neither the diagram
 * node nor its selection changed, so React Flow can skip re-rendering it.
 */
export function createNodeMapper() {
  const cache = new Map<string, { source: DiagramNode; selected: boolean; locked: boolean; z: number; flow: ShapeFlowNode }>()

  /**
   * `nodes`: the visible nodes. `locked`: ids of nodes that are locked, directly
   * or through their group; they can't be dragged.
   */
  return function toFlowNodes(
    nodes: readonly DiagramNode[],
    selected: ReadonlySet<string>,
    draggable = true,
    locked: ReadonlySet<string> = new Set(),
    /** z-index for a node (from its layer). */
    zOf: (node: DiagramNode) => number = () => 0,
  ): ShapeFlowNode[] {
    const seen = new Set<string>()
    const out = nodes.map((node) => {
      seen.add(node.id)
      const isSelected = selected.has(node.id)
      const isLocked = locked.has(node.id)
      const canDrag = draggable && !isLocked
      const z = zOf(node)
      const hit = cache.get(node.id)
      if (hit && hit.source === node && hit.selected === isSelected && hit.locked === isLocked && hit.z === z && hit.flow.draggable === canDrag) return hit.flow
      const flow: ShapeFlowNode = {
        id: node.id,
        type: 'shape',
        position: node.position,
        width: node.size.width,
        height: node.size.height,
        // The DOM size always equals the stored size, so hand it over as already
        // measured; otherwise React Flow re-measures every node on every change.
        measured: { width: node.size.width, height: node.size.height },
        selected: isSelected,
        draggable: canDrag,
        zIndex: z,
        data: { type: node.type, label: node.label, style: node.style, hasNotes: node.notes.trim().length > 0, locked: isLocked },
      }
      cache.set(node.id, { source: node, selected: isSelected, locked: isLocked, z, flow })
      return flow
    })
    for (const id of cache.keys()) if (!seen.has(id)) cache.delete(id)
    return out
  }
}

function marker(arrow: Arrowhead, colour: string): EdgeMarker | undefined {
  if (arrow === 'none') return undefined
  return { type: arrow === 'closed' ? MarkerType.ArrowClosed : MarkerType.Arrow, color: colour, width: 18, height: 18 }
}

/**
 * Drawing order: each layer is a band of z-indexes, higher layers above lower
 * ones; within a layer, group frames sit behind connectors, which sit behind nodes.
 */
export const LAYER_Z = 100
export const zForNode = (layer: number) => layer * LAYER_Z
export const zForEdge = (layer: number) => layer * LAYER_Z - 50
export const zForGroup = (layer: number, depth: number) => layer * LAYER_Z - 90 + Math.min(depth, 30)

/** Default edge width in px; the canvas passes the --cl-edge-width token. */
export const DEFAULT_EDGE_WIDTH = 1.5

export function toFlowEdge(edge: DiagramEdge, selected: boolean, defaultWidth = DEFAULT_EDGE_WIDTH, route?: Route, spread?: Spread, zIndex = zForEdge(0)): Edge {
  const style = edge.style
  const { colour, width, dashArray } = edgeAppearance(style, selected, defaultWidth)
  const lineType = style.lineType ?? EDGE_DEFAULTS.lineType
  // Every edge is drawn by FloatingEdge, which attaches exactly at side midpoints.
  // (React Flow's built-in edges attach at the outer edge of the handle's touch-sized
  // hit area, leaving a visible gap.) Pinned sides travel in data; auto sides float.
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: null,
    targetHandle: null,
    type: 'floating',
    zIndex,
    data: (route
      ? {
          lineType,
          sourceSide: route.sourceSide,
          targetSide: route.targetSide,
          ...(route.kind === 'detour' && { detour: route.points }),
          ...(spread?.source && { sourceShift: spread.source }),
          ...(spread?.target && { targetShift: spread.target }),
        }
      : {
          lineType,
          ...(isSide(edge.sourceHandle) && { sourceSide: edge.sourceHandle }),
          ...(isSide(edge.targetHandle) && { targetSide: edge.targetHandle }),
        }) satisfies FloatingEdgeData,
    selected,
    markerStart: marker(style.startArrow ?? EDGE_DEFAULTS.startArrow, colour),
    markerEnd: marker(style.endArrow ?? EDGE_DEFAULTS.endArrow, colour),
    style: { stroke: colour, strokeWidth: selected ? width * 1.5 : width, strokeDasharray: dashArray },
    label: edge.label.trim() ? edge.label : undefined,
    labelShowBg: true,
    labelBgPadding: [6, 3],
    // Wide invisible hit area so thin lines are easy to tap.
    interactionWidth: 24,
  }
}

export function toFlowEdges(diagram: Diagram, selected: ReadonlySet<string>, defaultWidth = DEFAULT_EDGE_WIDTH): Edge[] {
  return diagram.edges.map((edge) => toFlowEdge(edge, selected.has(edge.id), defaultWidth))
}

/**
 * Like toFlowEdges, but reuses the previous React Flow edge object when the
 * edge, its selection and its route are unchanged, so React Flow skips it.
 */
export function createEdgeMapper() {
  const cache = new Map<string, { source: DiagramEdge; selected: boolean; route: Route | undefined; spread: Spread | undefined; width: number; z: number; flow: Edge }>()
  /** `edges`: the visible edges (ends already moved onto collapsed groups). */
  return function toFlowEdgesCached(
    edges: readonly DiagramEdge[],
    selected: ReadonlySet<string>,
    routes: ReadonlyMap<string, Route>,
    defaultWidth = DEFAULT_EDGE_WIDTH,
    spreads: ReadonlyMap<string, Spread> = new Map(),
    zOf: (edge: DiagramEdge) => number = () => zForEdge(0),
  ): Edge[] {
    const seen = new Set<string>()
    const out = edges.map((edge) => {
      seen.add(edge.id)
      const isSelected = selected.has(edge.id)
      const route = routes.get(edge.id)
      const spread = spreads.get(edge.id)
      const z = zOf(edge)
      const hit = cache.get(edge.id)
      if (hit && hit.source === edge && hit.selected === isSelected && hit.route === route && hit.spread === spread && hit.width === defaultWidth && hit.z === z) return hit.flow
      const flow = toFlowEdge(edge, isSelected, defaultWidth, route, spread, z)
      cache.set(edge.id, { source: edge, selected: isSelected, route, spread, width: defaultWidth, z, flow })
      return flow
    })
    for (const id of cache.keys()) if (!seen.has(id)) cache.delete(id)
    return out
  }
}

export interface NodeChangeSummary {
  moves: Map<string, Position>
  resizes: { id: string; size: Size; position?: Position }[]
  removed: string[]
  selection: Map<string, boolean>
}

/** Splits React Flow node changes into store operations. Measurement-only changes are ignored. */
export function summariseNodeChanges(changes: NodeChange[]): NodeChangeSummary {
  const summary: NodeChangeSummary = { moves: new Map(), resizes: [], removed: [], selection: new Map() }
  for (const change of changes) {
    switch (change.type) {
      case 'position':
        if (change.position) summary.moves.set(change.id, change.position)
        break
      case 'dimensions':
        // Only resizer-driven changes carry setAttributes; plain measurements don't.
        if (change.dimensions && change.setAttributes) {
          summary.resizes.push({ id: change.id, size: { width: change.dimensions.width, height: change.dimensions.height } })
        }
        break
      case 'remove':
        summary.removed.push(change.id)
        break
      case 'select':
        summary.selection.set(change.id, change.selected)
        break
    }
  }
  // Resizing from the top or left also moves the node; fold that into the resize.
  for (const resize of summary.resizes) {
    const moved = summary.moves.get(resize.id)
    if (moved) {
      resize.position = moved
      summary.moves.delete(resize.id)
    }
  }
  return summary
}

export function summariseEdgeChanges(changes: EdgeChange[]): { removed: string[]; selection: Map<string, boolean> } {
  const removed: string[] = []
  const selection = new Map<string, boolean>()
  for (const change of changes) {
    if (change.type === 'remove') removed.push(change.id)
    if (change.type === 'select') selection.set(change.id, change.selected)
  }
  return { removed, selection }
}

/** Applies select/deselect flags to a selection list, keeping its order. */
export function applySelection(current: string[], flags: ReadonlyMap<string, boolean>): string[] {
  if (flags.size === 0) return current
  const next = current.filter((id) => flags.get(id) !== false)
  for (const [id, selected] of flags) if (selected && !next.includes(id)) next.push(id)
  return next
}
