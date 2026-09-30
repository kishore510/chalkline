import type { Diagram, DiagramEdge, DiagramNode, Position, Size } from '@/schema/diagram'
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

/** Removes nodes and edges by id. Edges attached to a removed node go too. */
export function deleteElements(diagram: Diagram, ids: Iterable<string>): Diagram {
  const remove = new Set(ids)
  if (remove.size === 0) return diagram
  const nodes = diagram.nodes.filter((n) => !remove.has(n.id))
  const edges = diagram.edges.filter((e) => !remove.has(e.id) && !remove.has(e.source) && !remove.has(e.target))
  if (nodes.length === diagram.nodes.length && edges.length === diagram.edges.length) return diagram
  return { ...diagram, nodes, edges }
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
