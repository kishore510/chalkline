import { DiagramSchema, EdgeStyleSchema, NodeStyleSchema, type Diagram, type DiagramEdge, type DiagramNode, type EdgeStyle, type NodeStyle, type Position, type Size } from '@/schema/diagram'
import { HANDLE_SIDES, type HandleSide } from '@/canvas/handles'
import { createEdge } from '@/schema/factories'

/*
 * Pure diagram operations. Each returns a new diagram (or the same object when
 * nothing changed) and never produces a document that fails DiagramSchema.
 */

export interface Connection {
  source: string
  target: string
  sourceHandle?: string | null
  targetHandle?: string | null
}

export function touch(diagram: Diagram, now = new Date()): Diagram {
  return { ...diagram, meta: { ...diagram.meta, updated: now.toISOString() } }
}

export function addNode(diagram: Diagram, node: DiagramNode): Diagram {
  if (diagram.nodes.some((n) => n.id === node.id)) return diagram
  return { ...diagram, nodes: [...diagram.nodes, node] }
}

function mapNodes(diagram: Diagram, update: (node: DiagramNode) => DiagramNode): Diagram {
  let changed = false
  const nodes = diagram.nodes.map((node) => {
    const next = update(node)
    if (next !== node) changed = true
    return next
  })
  return changed ? { ...diagram, nodes } : diagram
}

const isFinitePoint = (p: Position) => Number.isFinite(p.x) && Number.isFinite(p.y)

export function moveNodes(diagram: Diagram, moves: ReadonlyMap<string, Position>): Diagram {
  if (moves.size === 0) return diagram
  return mapNodes(diagram, (node) => {
    const to = moves.get(node.id)
    if (!to || !isFinitePoint(to) || (to.x === node.position.x && to.y === node.position.y)) return node
    return { ...node, position: { x: to.x, y: to.y } }
  })
}

export function resizeNode(diagram: Diagram, id: string, size: Size, position?: Position, minSize = 1): Diagram {
  if (!Number.isFinite(size.width) || !Number.isFinite(size.height)) return diagram
  const width = Math.max(minSize, size.width)
  const height = Math.max(minSize, size.height)
  return mapNodes(diagram, (node) => {
    if (node.id !== id) return node
    const nextPosition = position && isFinitePoint(position) ? { x: position.x, y: position.y } : node.position
    if (width === node.size.width && height === node.size.height && nextPosition === node.position) return node
    return { ...node, size: { width, height }, position: nextPosition }
  })
}

export function setNodeLabel(diagram: Diagram, id: string, label: string): Diagram {
  return mapNodes(diagram, (node) => (node.id === id && node.label !== label ? { ...node, label } : node))
}

export function setTitle(diagram: Diagram, title: string): Diagram {
  return title === diagram.meta.title ? diagram : { ...diagram, meta: { ...diagram.meta, title } }
}

/** True when an edge with the same ends and handles already exists. */
function isDuplicate(edges: DiagramEdge[], c: Connection): boolean {
  return edges.some(
    (e) =>
      e.source === c.source &&
      e.target === c.target &&
      (e.sourceHandle ?? null) === (c.sourceHandle ?? null) &&
      (e.targetHandle ?? null) === (c.targetHandle ?? null),
  )
}

/** Adds an edge. Returns the new edge id, or null for self-loops, duplicates and missing nodes. */
export function connect(diagram: Diagram, connection: Connection, id?: string): { diagram: Diagram; edgeId: string | null } {
  const { source, target } = connection
  const ids = new Set(diagram.nodes.map((n) => n.id))
  if (source === target || !ids.has(source) || !ids.has(target) || isDuplicate(diagram.edges, connection)) {
    return { diagram, edgeId: null }
  }
  const edge = createEdge(source, target, id ? { id } : {})
  if (connection.sourceHandle) edge.sourceHandle = connection.sourceHandle
  if (connection.targetHandle) edge.targetHandle = connection.targetHandle
  if (diagram.edges.some((e) => e.id === edge.id)) return { diagram, edgeId: null }
  return { diagram: { ...diagram, edges: [...diagram.edges, edge] }, edgeId: edge.id }
}

export interface Removed {
  nodes: DiagramNode[]
  edges: DiagramEdge[]
}

/** Removes nodes and edges by id, returning what went. Edges attached to a removed node go too. */
export function removeElements(diagram: Diagram, ids: Iterable<string>): { diagram: Diagram; removed: Removed } {
  const remove = new Set(ids)
  const removed: Removed = { nodes: [], edges: [] }
  if (remove.size === 0) return { diagram, removed }
  const nodes = diagram.nodes.filter((n) => !remove.has(n.id) || (removed.nodes.push(n), false))
  const edges = diagram.edges.filter(
    (e) => !(remove.has(e.id) || remove.has(e.source) || remove.has(e.target)) || (removed.edges.push(e), false),
  )
  if (removed.nodes.length === 0 && removed.edges.length === 0) return { diagram, removed }
  return { diagram: { ...diagram, nodes, edges }, removed }
}

export function deleteElements(diagram: Diagram, ids: Iterable<string>): Diagram {
  return removeElements(diagram, ids).diagram
}

/**
 * Puts removed elements back. Items whose id is taken again are skipped, as
 * are edges whose other end no longer exists, so the result is always valid.
 */
export function restoreElements(diagram: Diagram, removed: Removed): { diagram: Diagram; restored: string[] } {
  const taken = new Set([...diagram.nodes.map((n) => n.id), ...diagram.edges.map((e) => e.id)])
  const nodes = removed.nodes.filter((n) => !taken.has(n.id))
  const nodeIds = new Set([...diagram.nodes.map((n) => n.id), ...nodes.map((n) => n.id)])
  const edges = removed.edges.filter((e) => !taken.has(e.id) && nodeIds.has(e.source) && nodeIds.has(e.target))
  if (nodes.length === 0 && edges.length === 0) return { diagram, restored: [] }
  return {
    diagram: { ...diagram, nodes: [...diagram.nodes, ...nodes], edges: [...diagram.edges, ...edges] },
    restored: [...nodes.map((n) => n.id), ...edges.map((e) => e.id)],
  }
}

export function snap(value: number, grid: number): number {
  return grid > 0 ? Math.round(value / grid) * grid : value
}

export function snapPosition(p: Position, grid: number): Position {
  return { x: snap(p.x, grid), y: snap(p.y, grid) }
}

/**
 * Top-left position for a node of `size` centred on `center`. When another node
 * already sits exactly there (repeated taps on "add"), steps diagonally so new
 * nodes don't stack invisibly on top of each other.
 */
export function placeNode(diagram: Diagram, center: Position, size: Size, grid = 0, step = 24): Position {
  let position = snapPosition({ x: center.x - size.width / 2, y: center.y - size.height / 2 }, grid)
  const taken = (p: Position) => diagram.nodes.some((n) => Math.abs(n.position.x - p.x) < 1 && Math.abs(n.position.y - p.y) < 1)
  const offset = grid > 0 ? Math.max(grid, snap(step, grid)) : step
  for (let i = 0; i < 50 && taken(position); i++) {
    position = { x: position.x + offset, y: position.y + offset }
  }
  return position
}

/* ---------- Phase 2: styles, labels and notes ---------- */

/** A style change. A key set to undefined resets that property to the theme default. */
export type StylePatch<T> = { [K in keyof T]?: T[K] | undefined }

function patchStyle<T extends object>(style: T, patch: StylePatch<T>, schema: { safeParse: (v: unknown) => { success: boolean } }): T | null {
  const next = { ...style } as Record<string, unknown>
  let changed = false
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      if (key in next) {
        delete next[key]
        changed = true
      }
    } else if (next[key] !== value) {
      next[key] = value
      changed = true
    }
  }
  if (!changed) return style
  // Refuse anything the schema would reject, so the store never goes invalid.
  return schema.safeParse(next).success ? (next as T) : null
}

export function updateNodeStyles(diagram: Diagram, ids: Iterable<string>, patch: StylePatch<NodeStyle>): Diagram {
  const targets = new Set(ids)
  const probe = patchStyle({}, patch, NodeStyleSchema)
  if (probe === null) return diagram
  return mapNodes(diagram, (node) => {
    if (!targets.has(node.id)) return node
    const style = patchStyle(node.style, patch, NodeStyleSchema)
    return style && style !== node.style ? { ...node, style } : node
  })
}

export function resetNodeStyles(diagram: Diagram, ids: Iterable<string>): Diagram {
  const targets = new Set(ids)
  return mapNodes(diagram, (node) => (targets.has(node.id) && Object.keys(node.style).length > 0 ? { ...node, style: {} } : node))
}

export function setNodeNotes(diagram: Diagram, id: string, notes: string): Diagram {
  return mapNodes(diagram, (node) => (node.id === id && node.notes !== notes ? { ...node, notes } : node))
}

function mapEdges(diagram: Diagram, update: (edge: DiagramEdge) => DiagramEdge): Diagram {
  let changed = false
  const edges = diagram.edges.map((edge) => {
    const next = update(edge)
    if (next !== edge) changed = true
    return next
  })
  return changed ? { ...diagram, edges } : diagram
}

export function updateEdgeStyles(diagram: Diagram, ids: Iterable<string>, patch: StylePatch<EdgeStyle>): Diagram {
  const targets = new Set(ids)
  if (patchStyle({}, patch, EdgeStyleSchema) === null) return diagram
  return mapEdges(diagram, (edge) => {
    if (!targets.has(edge.id)) return edge
    const style = patchStyle(edge.style, patch, EdgeStyleSchema)
    return style && style !== edge.style ? { ...edge, style } : edge
  })
}

export function resetEdgeStyles(diagram: Diagram, ids: Iterable<string>): Diagram {
  const targets = new Set(ids)
  return mapEdges(diagram, (edge) => (targets.has(edge.id) && Object.keys(edge.style).length > 0 ? { ...edge, style: {} } : edge))
}

export function setEdgeLabel(diagram: Diagram, id: string, label: string): Diagram {
  return mapEdges(diagram, (edge) => (edge.id === id && edge.label !== label ? { ...edge, label } : edge))
}

export function setEdgeNotes(diagram: Diagram, id: string, notes: string): Diagram {
  return mapEdges(diagram, (edge) => (edge.id === id && edge.notes !== notes ? { ...edge, notes } : edge))
}

/**
 * Which side of each node an edge attaches to. A side pins that end; null
 * returns it to auto (the handle is removed and the end floats to the
 * nearest side); a missing key leaves that end unchanged.
 */
export interface SidesPatch {
  source?: HandleSide | null
  target?: HandleSide | null
}

export function setEdgeSides(diagram: Diagram, ids: Iterable<string>, patch: SidesPatch): Diagram {
  const valid = (side: HandleSide | null | undefined) => side === undefined || side === null || HANDLE_SIDES.includes(side)
  if (!valid(patch.source) || !valid(patch.target)) return diagram
  const targets = new Set(ids)
  return mapEdges(diagram, (edge) => {
    if (!targets.has(edge.id)) return edge
    let next = edge
    for (const [end, key] of [
      ['source', 'sourceHandle'],
      ['target', 'targetHandle'],
    ] as const) {
      const side = patch[end]
      if (side === undefined) continue
      if (side === null && key in next) {
        const { [key]: _removed, ...rest } = next
        next = rest
      } else if (side !== null && next[key] !== side) {
        next = { ...next, [key]: side }
      }
    }
    return next
  })
}

export function resetEdgeSides(diagram: Diagram, ids: Iterable<string>): Diagram {
  return setEdgeSides(diagram, ids, { source: null, target: null })
}

/** Makes a node at least `minHeight` tall (never shrinks it), e.g. so its label fits. */
export function growNodeHeight(diagram: Diagram, id: string, minHeight: number): Diagram {
  if (!Number.isFinite(minHeight)) return diagram
  return mapNodes(diagram, (node) =>
    node.id === id && node.size.height < minHeight ? { ...node, size: { ...node.size, height: Math.ceil(minHeight) } } : node,
  )
}

/** Where an edge's two ends attach. A null handle means auto (nearest side). */
export interface Reconnection {
  source: string
  target: string
  sourceHandle: HandleSide | null
  targetHandle: HandleSide | null
}

/**
 * Moves an edge's ends to other nodes and/or sides. Rejects self-loops,
 * missing nodes, unknown sides, exact duplicates of another edge, and
 * anything else the schema would refuse. Returns ok=false when rejected.
 */
export function reconnectEdge(diagram: Diagram, id: string, r: Reconnection): { diagram: Diagram; ok: boolean } {
  const reject = { diagram, ok: false }
  const edge = diagram.edges.find((e) => e.id === id)
  if (!edge || r.source === r.target) return reject
  const nodeIds = new Set(diagram.nodes.map((n) => n.id))
  if (!nodeIds.has(r.source) || !nodeIds.has(r.target)) return reject
  const side = (h: HandleSide | null) => h === null || HANDLE_SIDES.includes(h)
  if (!side(r.sourceHandle) || !side(r.targetHandle)) return reject
  const others = diagram.edges.filter((e) => e.id !== id)
  if (isDuplicate(others, r)) return reject

  const { sourceHandle: _s, targetHandle: _t, ...rest } = edge
  const next: DiagramEdge = {
    ...rest,
    source: r.source,
    target: r.target,
    ...(r.sourceHandle && { sourceHandle: r.sourceHandle }),
    ...(r.targetHandle && { targetHandle: r.targetHandle }),
  }
  const unchanged =
    next.source === edge.source &&
    next.target === edge.target &&
    next.sourceHandle === edge.sourceHandle &&
    next.targetHandle === edge.targetHandle
  if (unchanged) return { diagram, ok: true }

  const result = { ...diagram, edges: diagram.edges.map((e) => (e.id === id ? next : e)) }
  return DiagramSchema.safeParse(result).success ? { diagram: result, ok: true } : reject
}
