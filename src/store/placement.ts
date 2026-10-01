import type { Diagram, Position, Size } from '@/schema/diagram'
import { headerSize, unionBox, type Box } from './groups'

/*
 * Where a block of new items goes so it covers nothing: beside everything
 * already in the diagram (hidden items included, so showing a layer later
 * doesn't reveal an overlap), on whichever side is nearer the view.
 */

/** Space left between existing content and the new block. */
export const PLACEMENT_GAP = 80

/** Everything the diagram draws or could draw: shapes and group frames, collapsed groups as their header. */
export function contentBounds(diagram: Diagram): Box | null {
  return unionBox([
    ...diagram.nodes.map((n) => ({ ...n.position, ...n.size })),
    ...diagram.groups.map((g) => ({ ...g.position, width: g.size.width, height: g.collapsed ? headerSize(g) : g.size.height })),
  ])
}

const ceilTo = (v: number, grid: number) => (grid > 0 ? Math.ceil(v / grid) * grid : v)
const roundTo = (v: number, grid: number) => (grid > 0 ? Math.round(v / grid) * grid : v)

/**
 * Top-left for a block of `size`: centred on `viewCentre` when the diagram is
 * empty, otherwise to the right of or below the existing content (whichever
 * puts it nearer the view), a gap away, on the grid.
 */
export function placeInFreeSpace(diagram: Diagram, size: Size, viewCentre: Position, grid = 0): Position {
  const bounds = contentBounds(diagram)
  if (!bounds) return { x: roundTo(viewCentre.x - size.width / 2, grid), y: roundTo(viewCentre.y - size.height / 2, grid) }
  const right = { x: ceilTo(bounds.x + bounds.width + PLACEMENT_GAP, grid), y: roundTo(bounds.y, grid) }
  const below = { x: roundTo(bounds.x, grid), y: ceilTo(bounds.y + bounds.height + PLACEMENT_GAP, grid) }
  const distance = (p: Position) => Math.hypot(p.x + size.width / 2 - viewCentre.x, p.y + size.height / 2 - viewCentre.y)
  return distance(right) <= distance(below) ? right : below
}
