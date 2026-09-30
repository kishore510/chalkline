import type { EdgeStyle, Position as Point, Size } from '@/schema/diagram'
import { floatingEndpoints, sidePoint, sidesOf, type Box } from './floating'
import { HANDLE_SIDES, type HandleSide } from './handles'

/*
 * Obstacle-aware routing for connectors with Auto ends.
 *
 * Each candidate route is modelled as a polyline (straight lines as one
 * segment; the other line types as the orthogonal route they roughly
 * follow) and tested against the padded boxes of every node except the
 * edge's own two. Pure: no React, no store, so it can be reused by a later
 * "Tidy connectors" action.
 */

export interface RoutableNode {
  id: string
  position: Point
  size: Size
  /** Shape id, so connectors attach on the shape's outline (bounding boxes stay the obstacle test). */
  type?: string
}

export interface RoutableEdge {
  id: string
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
  style: Pick<EdgeStyle, 'lineType'>
}

export interface RouteOptions {
  /** Clearance kept around other nodes. */
  padding: number
  /** How far a route runs straight out of a side before turning. */
  gap: number
}

export const DEFAULT_ROUTE_OPTIONS: RouteOptions = { padding: 8, gap: 20 }

export interface Route {
  sourceSide: HandleSide
  targetSide: HandleSide
  /** 'direct': draw with the edge's own line type between the sides. 'detour': follow `points`. */
  kind: 'direct' | 'detour'
  /** The modelled path, from source to target. */
  points: Point[]
  /** False when no candidate was clear and the shortest path was used anyway. */
  clear: boolean
  /** Nodes that blocked the nearest-sides path; a change to any of them means re-routing. */
  blockers: string[]
  /** The nearest-sides path, kept so a node moving into it triggers re-routing. */
  basePoints: Point[]
}

const OUT: Record<HandleSide, Point> = { top: { x: 0, y: -1 }, right: { x: 1, y: 0 }, bottom: { x: 0, y: 1 }, left: { x: -1, y: 0 } }
const horizontal = (side: HandleSide) => side === 'left' || side === 'right'
const isSide = (h: string | undefined): h is HandleSide => HANDLE_SIDES.includes(h as HandleSide)
const boxOf = (n: RoutableNode): Box => ({ ...n.position, ...n.size, ...(n.type !== undefined && { type: n.type }) })
const pad = (b: Box, p: number): Box => ({ x: b.x - p, y: b.y - p, width: b.width + 2 * p, height: b.height + 2 * p })

/** Drops repeated and collinear points so the point count reflects real bends. */
function simplify(points: Point[]): Point[] {
  const out: Point[] = []
  for (const p of points) {
    const last = out.at(-1)
    if (last && Math.abs(last.x - p.x) < 0.01 && Math.abs(last.y - p.y) < 0.01) continue
    const prev = out.at(-2)
    if (prev && last) {
      const cross = (last.x - prev.x) * (p.y - prev.y) - (last.y - prev.y) * (p.x - prev.x)
      if (Math.abs(cross) < 0.01) out.pop()
    }
    out.push(p)
  }
  return out
}

const stub = (p: Point, side: HandleSide, gap: number): Point => ({ x: p.x + OUT[side].x * gap, y: p.y + OUT[side].y * gap })

/** Orthogonal route between two side points, as step/smoothstep edges roughly draw it. */
function orthogonal(sp: Point, s: HandleSide, tp: Point, t: HandleSide, gap: number): Point[] {
  const p1 = stub(sp, s, gap)
  const p2 = stub(tp, t, gap)
  let mid: Point[]
  if (horizontal(s) && horizontal(t)) {
    const x = s === t ? (s === 'right' ? Math.max(p1.x, p2.x) : Math.min(p1.x, p2.x)) : (p1.x + p2.x) / 2
    mid = [{ x, y: p1.y }, { x, y: p2.y }]
  } else if (!horizontal(s) && !horizontal(t)) {
    const y = s === t ? (s === 'bottom' ? Math.max(p1.y, p2.y) : Math.min(p1.y, p2.y)) : (p1.y + p2.y) / 2
    mid = [{ x: p1.x, y }, { x: p2.x, y }]
  } else if (horizontal(s)) {
    mid = [{ x: p2.x, y: p1.y }]
  } else {
    mid = [{ x: p1.x, y: p2.y }]
  }
  return simplify([sp, p1, ...mid, p2, tp])
}

/** Does segment a-b pass through box? (Liang–Barsky clipping.) */
export function segmentHitsBox(a: Point, b: Point, box: Box): boolean {
  let t0 = 0
  let t1 = 1
  const dx = b.x - a.x
  const dy = b.y - a.y
  const checks: [number, number][] = [
    [-dx, a.x - box.x],
    [dx, box.x + box.width - a.x],
    [-dy, a.y - box.y],
    [dy, box.y + box.height - a.y],
  ]
  for (const [p, q] of checks) {
    if (p === 0) {
      if (q < 0) return false
    } else {
      const r = q / p
      if (p < 0) t0 = Math.max(t0, r)
      else t1 = Math.min(t1, r)
      if (t0 > t1) return false
    }
  }
  return true
}

function hits(points: Point[], obstacles: readonly RoutableNode[], padding: number): string[] {
  const ids: string[] = []
  for (const node of obstacles) {
    const box = pad(boxOf(node), padding)
    for (let i = 0; i < points.length - 1; i++) {
      if (segmentHitsBox(points[i]!, points[i + 1]!, box)) {
        ids.push(node.id)
        break
      }
    }
  }
  return ids
}

export function pathIsClear(points: Point[], obstacles: readonly RoutableNode[], padding: number): boolean {
  return hits(points, obstacles, padding).length === 0
}

function length(points: Point[]): number {
  let total = 0
  for (let i = 0; i < points.length - 1; i++) total += Math.hypot(points[i + 1]!.x - points[i]!.x, points[i + 1]!.y - points[i]!.y)
  return total
}

interface Candidate {
  sourceSide: HandleSide
  targetSide: HandleSide
  kind: Route['kind']
  points: Point[]
}

const OPPOSITE: Record<HandleSide, HandleSide> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' }

/**
 * Step routes that leave and enter along the sides' directions but swing out
 * into a lane beyond whatever is in the way (above/below for horizontal
 * pairs, left/right for vertical ones). The lane widens to take in anything
 * else it runs into, a few times over.
 */
function detours(sp: Point, s: HandleSide, tp: Point, t: HandleSide, obstacles: readonly RoutableNode[], o: RouteOptions): Point[][] {
  if (OPPOSITE[s] !== t) return []
  const p1 = stub(sp, s, o.gap)
  const p2 = stub(tp, t, o.gap)
  const across = horizontal(s)
  const results: Point[][] = []
  for (const direction of [-1, 1] as const) {
    const build = (lane: number) =>
      simplify(
        across
          ? [sp, p1, { x: p1.x, y: lane }, { x: p2.x, y: lane }, p2, tp]
          : [sp, p1, { x: lane, y: p1.y }, { x: lane, y: p2.y }, p2, tp],
      )
    const base = across ? [sp, p1, { x: p2.x, y: p1.y }, p2, tp] : [sp, p1, { x: p1.x, y: p2.y }, p2, tp]
    let inTheWay = obstacles.filter((n) => hits(base, [n], o.padding).length > 0)
    if (inTheWay.length === 0) continue
    for (let attempt = 0; attempt < 4; attempt++) {
      const boxes = inTheWay.map(boxOf)
      const lane = across
        ? direction < 0
          ? Math.min(...boxes.map((b) => b.y), sp.y, tp.y) - o.padding - o.gap
          : Math.max(...boxes.map((b) => b.y + b.height), sp.y, tp.y) + o.padding + o.gap
        : direction < 0
          ? Math.min(...boxes.map((b) => b.x), sp.x, tp.x) - o.padding - o.gap
          : Math.max(...boxes.map((b) => b.x + b.width), sp.x, tp.x) + o.padding + o.gap
      const points = build(lane)
      const blocking = obstacles.filter((n) => hits(points, [n], o.padding).length > 0)
      if (blocking.length === 0) {
        results.push(points)
        break
      }
      inTheWay = [...new Set([...inTheWay, ...blocking])]
    }
  }
  return results
}

/**
 * Chooses sides (and, if needed, a detour) for one edge.
 * 1. The nearest facing sides, if that path is clear.
 * 2. Otherwise the clear candidate with the fewest bends (then shortest):
 *    other side pairs first, then detours around the blockers.
 * 3. If nothing is clear, the nearest-sides path anyway.
 * Pinned ends keep their side; an edge with both ends pinned is left as is.
 */
export function routeEdge(nodes: readonly RoutableNode[], edge: RoutableEdge, options: RouteOptions = DEFAULT_ROUTE_OPTIONS): Route {
  const source = nodes.find((n) => n.id === edge.source)
  const target = nodes.find((n) => n.id === edge.target)
  const fixedSource = isSide(edge.sourceHandle) ? edge.sourceHandle : undefined
  const fixedTarget = isSide(edge.targetHandle) ? edge.targetHandle : undefined
  const straight = edge.style.lineType === 'straight'

  if (!source || !target) {
    return { sourceSide: fixedSource ?? 'right', targetSide: fixedTarget ?? 'left', kind: 'direct', points: [], clear: true, blockers: [], basePoints: [] }
  }
  const sBox = boxOf(source)
  const tBox = boxOf(target)
  const pathFor = (s: HandleSide, t: HandleSide) => {
    const sp = sidePoint(sBox, s)
    const tp = sidePoint(tBox, t)
    return straight ? [sp, tp] : orthogonal(sp, s, tp, t, options.gap)
  }

  const nearest = floatingEndpoints(sBox, tBox, fixedSource, fixedTarget)
  const basePoints = pathFor(nearest.sourceSide, nearest.targetSide)
  const base: Route = { sourceSide: nearest.sourceSide, targetSide: nearest.targetSide, kind: 'direct', points: basePoints, clear: true, blockers: [], basePoints }
  if (fixedSource && fixedTarget) return base

  const obstacles = nodes.filter((n) => n.id !== edge.source && n.id !== edge.target)
  const blockers = hits(basePoints, obstacles, options.padding)
  if (blockers.length === 0) return base

  const candidates: Candidate[] = []
  for (const s of fixedSource ? [fixedSource] : sidesOf(sBox)) {
    for (const t of fixedTarget ? [fixedTarget] : sidesOf(tBox)) {
      if (s === nearest.sourceSide && t === nearest.targetSide) continue
      candidates.push({ sourceSide: s, targetSide: t, kind: 'direct', points: pathFor(s, t) })
    }
  }
  for (const s of fixedSource ? [fixedSource] : sidesOf(sBox)) {
    for (const t of fixedTarget ? [fixedTarget] : sidesOf(tBox)) {
      for (const points of detours(sidePoint(sBox, s), s, sidePoint(tBox, t), t, obstacles, options)) {
        candidates.push({ sourceSide: s, targetSide: t, kind: 'detour', points })
      }
    }
  }

  const clear = candidates
    .filter((c) => pathIsClear(c.points, obstacles, options.padding))
    .map((c, order) => ({ c, bends: c.points.length - 2, length: length(c.points), order }))
    .sort((a, b) => a.bends - b.bends || a.length - b.length || a.order - b.order)
  const best = clear[0]?.c
  if (!best) return { ...base, clear: false, blockers }
  return { ...best, clear: true, blockers, basePoints }
}

/**
 * Routes every edge of a diagram, reusing the previous route object for
 * edges a change can't affect. An edge is re-routed only if it changed, one
 * of its nodes changed, a changed node had blocked it, or a changed node now
 * overlaps its path. Keeps node drags smooth: unrelated edges are untouched.
 */
export function createRouteCache(options: RouteOptions = DEFAULT_ROUTE_OPTIONS) {
  let lastNodes = new Map<string, RoutableNode>()
  let lastEdges = new Map<string, RoutableEdge>()
  let routes = new Map<string, Route>()

  return function route(diagram: { nodes: readonly RoutableNode[]; edges: readonly RoutableEdge[] }): Map<string, Route> {
    const nodeMap = new Map(diagram.nodes.map((n) => [n.id, n]))
    const changed = new Set<string>()
    for (const [id, n] of nodeMap) if (lastNodes.get(id) !== n) changed.add(id)
    for (const id of lastNodes.keys()) if (!nodeMap.has(id)) changed.add(id)

    const changedBoxes = [...changed].map((id) => nodeMap.get(id)).filter((n): n is RoutableNode => Boolean(n))
    const next = new Map<string, Route>()
    for (const edge of diagram.edges) {
      const previous = routes.get(edge.id)
      const stale =
        !previous ||
        lastEdges.get(edge.id) !== edge ||
        changed.has(edge.source) ||
        changed.has(edge.target) ||
        previous.blockers.some((id) => changed.has(id)) ||
        changedBoxes.some((n) => n.id !== edge.source && n.id !== edge.target && hits([...previous.points], [n], options.padding).length + hits(previous.basePoints, [n], options.padding).length > 0)
      next.set(edge.id, stale ? routeEdge(diagram.nodes, edge, options) : previous)
    }
    lastNodes = nodeMap
    lastEdges = new Map(diagram.edges.map((e) => [e.id, e]))
    routes = next
    return next
  }
}
