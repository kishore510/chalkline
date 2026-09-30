import type { Diagram, Position as Point } from '@/schema/diagram'
import { anchorPoint, getShape } from '@/shapes/registry'
import { HANDLE_SIDES, type HandleSide } from './handles'

/*
 * Floating edges: an edge without stored handles attaches to whichever sides
 * of its two nodes face each other most closely, recomputed as nodes move.
 */

export interface Box {
  x: number
  y: number
  width: number
  height: number
  /** Shape id, for shape nodes: attachment points then sit on the shape's outline. */
  type?: string
}

const OUTWARD: Record<HandleSide, Point> = {
  top: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
}

/** Where a connector attaches on a side: the shape's outline point, or the box side's midpoint. */
export function sidePoint(box: Box, side: HandleSide): Point {
  return anchorPoint({ type: box.type, position: { x: box.x, y: box.y }, size: { width: box.width, height: box.height } }, side)
}

/** Sides a connector may use: all four for plain boxes, the shape's own list otherwise. */
export function sidesOf(box: Box): readonly HandleSide[] {
  return box.type === undefined ? HANDLE_SIDES : getShape(box.type).sides
}

export interface FloatingEnds {
  sourceSide: HandleSide
  targetSide: HandleSide
  sourceX: number
  sourceY: number
  targetX: number
  targetY: number
}

const faces = (side: HandleSide, from: Point, to: Point) => OUTWARD[side].x * (to.x - from.x) + OUTWARD[side].y * (to.y - from.y) > 0

/**
 * Picks the pair of side midpoints that are closest while facing each other,
 * so diagonal layouts get sensible routes. A side that is already stored is
 * kept. If the nodes overlap and nothing faces, the closest pair wins.
 */
export function floatingEndpoints(source: Box, target: Box, fixedSource?: HandleSide, fixedTarget?: HandleSide): FloatingEnds {
  const sourceSides = fixedSource ? [fixedSource] : sidesOf(source)
  const targetSides = fixedTarget ? [fixedTarget] : sidesOf(target)
  let best: { facing: boolean; distance: number; s: HandleSide; t: HandleSide } | null = null
  for (const s of sourceSides) {
    const sp = sidePoint(source, s)
    for (const t of targetSides) {
      const tp = sidePoint(target, t)
      const facing = faces(s, sp, tp) && faces(t, tp, sp)
      const distance = Math.hypot(tp.x - sp.x, tp.y - sp.y)
      if (!best || (facing && !best.facing) || (facing === best.facing && distance < best.distance)) {
        best = { facing, distance, s, t }
      }
    }
  }
  const { s, t } = best!
  const sp = sidePoint(source, s)
  const tp = sidePoint(target, t)
  return { sourceSide: s, targetSide: t, sourceX: sp.x, sourceY: sp.y, targetX: tp.x, targetY: tp.y }
}

export interface Viewport {
  x: number
  y: number
  zoom: number
}

/**
 * Viewport that brings `bounds` (flow coordinates) into a visible area of the
 * canvas (e.g. the part above a bottom sheet), or null if it is already inside
 * with `margin` to spare. Keeps the zoom and centres the item.
 */
export function revealViewport(bounds: Box, viewport: Viewport, visible: { width: number; height: number }, margin: number): Viewport | null {
  const { zoom } = viewport
  const left = bounds.x * zoom + viewport.x
  const top = bounds.y * zoom + viewport.y
  const right = left + bounds.width * zoom
  const bottom = top + bounds.height * zoom
  if (left >= margin && top >= margin && right <= visible.width - margin && bottom <= visible.height - margin) return null
  const cx = bounds.x + bounds.width / 2
  const cy = bounds.y + bounds.height / 2
  return { x: visible.width / 2 - cx * zoom, y: visible.height / 2 - cy * zoom, zoom }
}

/** Smallest box containing all of `boxes`. */
export function unionBox(boxes: Box[]): Box | null {
  if (boxes.length === 0) return null
  const x = Math.min(...boxes.map((b) => b.x))
  const y = Math.min(...boxes.map((b) => b.y))
  const right = Math.max(...boxes.map((b) => b.x + b.width))
  const bottom = Math.max(...boxes.map((b) => b.y + b.height))
  return { x, y, width: right - x, height: bottom - y }
}

/** Bounds of the selected nodes, and of both ends of selected edges. */
export function selectionBounds(diagram: Diagram, ids: readonly string[]): Box | null {
  const selected = new Set(ids)
  const nodeIds = new Set<string>()
  for (const edge of diagram.edges) {
    if (selected.has(edge.id)) nodeIds.add(edge.source).add(edge.target)
  }
  const boxes = diagram.nodes.filter((n) => selected.has(n.id) || nodeIds.has(n.id)).map((n) => ({ ...n.position, ...n.size }))
  return unionBox(boxes)
}
