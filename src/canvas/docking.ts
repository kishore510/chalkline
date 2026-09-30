import type { Position, Size } from '@/schema/diagram'
import { sidePoint } from './floating'
import { HANDLE_SIDES, type HandleSide } from './handles'

export interface DockingTarget {
  nodeId: string
  side: HandleSide
  x: number
  y: number
}

interface NodeLike {
  id: string
  position: Position
  size: Size
}

/**
 * The docking point a dragged connector end should snap to. Inside a node it
 * snaps to that node's nearest side (topmost node wins); just outside, it
 * snaps to any side midpoint within `radius`. `excludeId` is the node at the
 * connector's other end, which can't be targeted (no self-loops).
 */
export function findDockingTarget(point: Position, nodes: readonly NodeLike[], radius: number, excludeId: string): DockingTarget | null {
  const nearestSide = (node: NodeLike) => {
    const box = { ...node.position, ...node.size }
    let best: DockingTarget | null = null
    let bestDistance = Infinity
    for (const side of HANDLE_SIDES) {
      const p = sidePoint(box, side)
      const distance = Math.hypot(p.x - point.x, p.y - point.y)
      if (distance < bestDistance) {
        bestDistance = distance
        best = { nodeId: node.id, side, x: p.x, y: p.y }
      }
    }
    return { target: best!, distance: bestDistance }
  }

  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i]!
    if (node.id === excludeId) continue
    const { x, y } = node.position
    const inside = point.x >= x && point.x <= x + node.size.width && point.y >= y && point.y <= y + node.size.height
    if (inside) return nearestSide(node).target
  }

  let best: DockingTarget | null = null
  let bestDistance = radius
  for (const node of nodes) {
    if (node.id === excludeId) continue
    const { target, distance } = nearestSide(node)
    if (distance <= bestDistance) {
      bestDistance = distance
      best = target
    }
  }
  return best
}
