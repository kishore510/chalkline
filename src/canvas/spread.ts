import { getShape } from '@/shapes/registry'
import type { HandleSide } from './handles'
import type { Route, RoutableNode } from './routing'

/*
 * Connectors that meet the same side of a shape would stack on its midpoint.
 * At draw time (never stored), spread them evenly along that side, ordered by
 * where each connector is heading so they don't cross. Values are offsets
 * from the side's midpoint, along the side.
 */

export interface Spread {
  source: number
  target: number
}

interface EdgeLike {
  id: string
  source: string
  target: string
}

const ZERO: Spread = { source: 0, target: 0 }
const along = (side: HandleSide) => (side === 'left' || side === 'right' ? 'y' : 'x')

export function spreadAttachments(
  nodes: readonly RoutableNode[],
  edges: readonly EdgeLike[],
  routes: ReadonlyMap<string, Route>,
  previous?: ReadonlyMap<string, Spread>,
): Map<string, Spread> {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const centre = (id: string) => {
    const n = byId.get(id)
    return n ? { x: n.position.x + n.size.width / 2, y: n.position.y + n.size.height / 2 } : { x: 0, y: 0 }
  }

  // Group connector ends by the node side they attach to. Detours keep their midpoints.
  const sides = new Map<string, { edge: string; end: 'source' | 'target'; key: number }[]>()
  for (const edge of edges) {
    const route = routes.get(edge.id)
    if (!route || route.kind !== 'direct') continue
    for (const end of ['source', 'target'] as const) {
      const nodeId = edge[end]
      const side = end === 'source' ? route.sourceSide : route.targetSide
      const other = centre(end === 'source' ? edge.target : edge.source)
      const slot = `${nodeId}|${side}`
      sides.set(slot, [...(sides.get(slot) ?? []), { edge: edge.id, end, key: other[along(side)] }])
    }
  }

  const values = new Map<string, { source: number; target: number }>()
  for (const [slot, ends] of sides) {
    if (ends.length < 2) continue
    const [nodeId, side] = slot.split('|') as [string, HandleSide]
    const node = byId.get(nodeId)
    // Only sides flat enough to spread along (a diamond's vertex, say, isn't).
    if (!node || (node.type !== undefined && !getShape(node.type).spreadSides.includes(side))) continue
    const length = along(side) === 'y' ? node.size.height : node.size.width
    ends.sort((a, b) => a.key - b.key || a.edge.localeCompare(b.edge))
    ends.forEach((e, i) => {
      const offset = Math.round(length * ((i + 1) / (ends.length + 1) - 0.5) * 100) / 100
      const v = values.get(e.edge) ?? { source: 0, target: 0 }
      v[e.end] = offset
      values.set(e.edge, v)
    })
  }

  const out = new Map<string, Spread>()
  for (const edge of edges) {
    const v = values.get(edge.id) ?? ZERO
    const old = previous?.get(edge.id)
    // Reuse the previous object when unchanged, so the edge isn't redrawn.
    out.set(edge.id, old && old.source === v.source && old.target === v.target ? old : v === ZERO ? ZERO : { source: v.source, target: v.target })
  }
  return out
}

/** A side's midpoint moved `offset` along the side. */
export function shiftAlongSide(point: { x: number; y: number }, side: HandleSide, offset: number) {
  return along(side) === 'y' ? { x: point.x, y: point.y + offset } : { x: point.x + offset, y: point.y }
}
