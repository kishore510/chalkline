import { MarkerType, type Edge, type EdgeChange, type EdgeMarker, type Node, type NodeChange } from '@xyflow/react'
import type { Diagram, DiagramEdge, DiagramNode, EdgeStyle, NodeStyle, NodeType, Position, Size } from '@/schema/diagram'
import { edgeAppearance } from './appearance'
import { HANDLE_SIDES, type HandleSide } from './handles'

/*
 * Pure translation between the diagram document and React Flow. The store is
 * the source of truth; React Flow renders these objects and reports changes,
 * which are turned back into store operations here.
 */

type Arrowhead = NonNullable<EdgeStyle['endArrow']>

export type ShapeNodeData = { type: NodeType; label: string; style: NodeStyle; hasNotes: boolean }
export type ShapeFlowNode = Node<ShapeNodeData, 'shape'>

/** Rendering defaults for optional edge style fields. */
export const EDGE_DEFAULTS = {
  lineType: 'smoothstep',
  startArrow: 'none',
  endArrow: 'arrow',
} as const satisfies Required<Pick<EdgeStyle, 'lineType' | 'startArrow' | 'endArrow'>>

const FLOW_EDGE_TYPE = { straight: 'straight', step: 'step', smoothstep: 'smoothstep', bezier: 'default' } as const

/**
 * Builds React Flow nodes, reusing the previous object when neither the diagram
 * node nor its selection changed, so React Flow can skip re-rendering it.
 */
export function createNodeMapper() {
  const cache = new Map<string, { source: DiagramNode; selected: boolean; flow: ShapeFlowNode }>()

  return function toFlowNodes(diagram: Diagram, selected: ReadonlySet<string>, draggable = true): ShapeFlowNode[] {
    const seen = new Set<string>()
    const nodes = diagram.nodes.map((node) => {
      seen.add(node.id)
      const isSelected = selected.has(node.id)
      const hit = cache.get(node.id)
      if (hit && hit.source === node && hit.selected === isSelected && hit.flow.draggable === draggable) return hit.flow
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
        draggable,
        data: { type: node.type, label: node.label, style: node.style, hasNotes: node.notes.trim().length > 0 },
      }
      cache.set(node.id, { source: node, selected: isSelected, flow })
      return flow
    })
    for (const id of cache.keys()) if (!seen.has(id)) cache.delete(id)
    return nodes
  }
}

function marker(arrow: Arrowhead, colour: string): EdgeMarker | undefined {
  if (arrow === 'none') return undefined
  return { type: arrow === 'closed' ? MarkerType.ArrowClosed : MarkerType.Arrow, color: colour, width: 18, height: 18 }
}

/** Default edge width in px; the canvas passes the --cl-edge-width token. */
export const DEFAULT_EDGE_WIDTH = 1.5

export function toFlowEdge(edge: DiagramEdge, selected: boolean, defaultWidth = DEFAULT_EDGE_WIDTH): Edge {
  const style = edge.style
  const { colour, width, dashArray } = edgeAppearance(style, selected, defaultWidth)
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle ?? null,
    targetHandle: edge.targetHandle ?? null,
    type: FLOW_EDGE_TYPE[style.lineType ?? EDGE_DEFAULTS.lineType],
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

/** The side of a box closest to a point, used when a connector is dropped on a node body. */
export function nearestSide(box: { x: number; y: number; width: number; height: number }, point: Position): HandleSide {
  const distances: Record<HandleSide, number> = {
    top: Math.abs(point.y - box.y),
    bottom: Math.abs(box.y + box.height - point.y),
    left: Math.abs(point.x - box.x),
    right: Math.abs(box.x + box.width - point.x),
  }
  return HANDLE_SIDES.reduce((best, side) => (distances[side] < distances[best] ? side : best))
}
