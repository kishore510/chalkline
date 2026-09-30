import type { Position } from '@/schema/diagram'
import type { Box } from '@/store/groups'

/*
 * Smart guides: pure geometry, no React. Everything is in absolute canvas
 * (diagram) coordinates; only the threshold is given in screen pixels and
 * turned into canvas units with the zoom. Nothing here is ever saved.
 *
 * Axis naming: the 'x' axis is horizontal movement, so its guide lines are
 * vertical (a line at x = `at`, running from y = `from` to y = `to`).
 */

export type Axis = 'x' | 'y'

/** Something the moving shape can line up with. */
export interface GuideTarget {
  id: string
  box: Box
}

/** A box that offers only its centre lines: the whole diagram, or the enclosing group or lane. */
export interface CentreTarget {
  kind: 'diagram' | 'container'
  id?: string
  box: Box
}

export type GuideKind = 'edge' | 'centre' | 'diagram' | 'container'

/** A guide line. Axis 'x': the vertical line x = at, from y = from to y = to. */
export interface GuideLine {
  axis: Axis
  kind: GuideKind
  at: number
  from: number
  to: number
}

/**
 * A distance marker. 'gap': the space between two shapes along `axis`, drawn
 * across at the other coordinate `at`. 'size': a matched width (axis 'x') or
 * height (axis 'y'), drawn along the edge at `at`.
 */
export interface Measure {
  kind: 'gap' | 'size'
  axis: Axis
  from: number
  to: number
  at: number
  value: number
}

export type SnapSource = 'guide' | 'grid' | null

export interface GuideResult {
  dx: number
  dy: number
  snapX: SnapSource
  snapY: SnapSource
  lines: GuideLine[]
  measures: Measure[]
  /** Targets something lines up with (for their outline), each once. */
  aligned: GuideTarget[]
}

export interface GuideOptions {
  zoom: number
  /** Screen pixels. */
  threshold?: number
  /** False: grid only (guides switched off, or Alt held). */
  guides?: boolean
  centres?: readonly CentreTarget[]
  /** Equal-spacing markers; self-contained so it can be switched off. */
  equalSpacing?: boolean
  /** Grid size in canvas units; 0 = no grid snap. */
  grid?: number
  /** The point the grid snaps (default: the moving box's top-left). */
  gridAnchor?: Position
}

export const DEFAULT_THRESHOLD = 6
const EPS = 1e-6

const span = (b: Box, axis: Axis) => (axis === 'x' ? { lo: b.x, hi: b.x + b.width } : { lo: b.y, hi: b.y + b.height })
const cross = (axis: Axis): Axis => (axis === 'x' ? 'y' : 'x')
/** Left, centre, right (or top, middle, bottom). */
const linesOf = (b: Box, axis: Axis): [number, number, number] => {
  const { lo, hi } = span(b, axis)
  return [lo, (lo + hi) / 2, hi]
}
const shift = (b: Box, dx: number, dy: number): Box => ({ ...b, x: b.x + dx, y: b.y + dy })

interface Match {
  delta: number
  /** Alignment beats spacing when equally close. */
  rank: number
}

const better = (a: Match | null, b: Match) => !a || Math.abs(b.delta) < Math.abs(a.delta) - EPS || (Math.abs(b.delta - a.delta) <= EPS && b.rank < a.rank)

/** The nearest alignment on one axis: any moving line to any target line, or centre to a centre target. */
function nearestAlignment(moving: Box, targets: readonly GuideTarget[], centres: readonly CentreTarget[], axis: Axis, limit: number): Match | null {
  const own = linesOf(moving, axis)
  let best: Match | null = null
  for (const t of targets) {
    for (const line of linesOf(t.box, axis)) {
      for (const m of own) {
        const delta = line - m
        if (Math.abs(delta) <= limit && better(best, { delta, rank: 0 })) best = { delta, rank: 0 }
      }
    }
  }
  for (const c of centres) {
    const delta = linesOf(c.box, axis)[1] - own[1]
    if (Math.abs(delta) <= limit && better(best, { delta, rank: 0 })) best = { delta, rank: 0 }
  }
  return best
}

/** Every target line the (already snapped) moving box sits on, merged into one line per position. */
function alignedLines(moving: Box, targets: readonly GuideTarget[], centres: readonly CentreTarget[], axis: Axis, aligned: Map<string, GuideTarget>): GuideLine[] {
  const own = linesOf(moving, axis)
  const other = cross(axis)
  const byAt = new Map<number, GuideLine>()
  const add = (at: number, kind: GuideKind, box: Box) => {
    const key = Math.round(at * 1000) / 1000
    const s = span(box, other)
    const m = span(moving, other)
    const line = byAt.get(key)
    if (!line) {
      byAt.set(key, { axis, kind, at, from: Math.min(s.lo, m.lo), to: Math.max(s.hi, m.hi) })
      return
    }
    line.from = Math.min(line.from, s.lo)
    line.to = Math.max(line.to, s.hi)
    // Diagram and container centres are named, so the more specific kind wins.
    if (kind === 'diagram' || kind === 'container') line.kind = kind
  }
  for (const t of targets) {
    const lines = linesOf(t.box, axis)
    lines.forEach((line, i) => {
      for (const [j, m] of own.entries()) {
        if (Math.abs(line - m) > EPS) continue
        add(line, i === 1 && j === 1 ? 'centre' : 'edge', t.box)
        aligned.set(t.id, t)
      }
    })
  }
  for (const c of centres) {
    const centre = linesOf(c.box, axis)[1]
    if (Math.abs(centre - own[1]) <= EPS) add(centre, c.kind, c.box)
  }
  return [...byAt.values()]
}

/* ---------- Equal spacing ---------- */

const overlaps = (a: Box, b: Box, axis: Axis) => {
  const s = span(a, axis)
  const t = span(b, axis)
  return s.lo < t.hi - EPS && t.lo < s.hi - EPS
}

/** Middle of the shared stretch of two boxes across `axis` (or between them if they don't share one). */
function markerAt(a: Box, b: Box, axis: Axis): number {
  const s = span(a, cross(axis))
  const t = span(b, cross(axis))
  return (Math.max(s.lo, t.lo) + Math.min(s.hi, t.hi)) / 2
}

interface Gap {
  a: Box
  b: Box
  size: number
}

/** Targets in the moving box's row (axis 'x') or column (axis 'y'): they overlap it across the axis. */
const rowOf = (moving: Box, targets: readonly GuideTarget[], axis: Axis) => targets.map((t) => t.box).filter((b) => overlaps(b, moving, cross(axis)))

/** Gaps between neighbours in a row: each box and the nearest one after it that doesn't overlap it. */
function rowGaps(row: Box[], axis: Axis): Gap[] {
  const gaps: Gap[] = []
  for (const a of row) {
    const end = span(a, axis).hi
    let next: Box | null = null
    for (const b of row) {
      const start = span(b, axis).lo
      if (start >= end - EPS && (!next || start < span(next, axis).lo)) next = b
    }
    if (next) gaps.push({ a, b: next, size: span(next, axis).lo - end })
  }
  return gaps
}

/** Neighbours of the moving box in its row: the nearest one ending before it and the nearest starting after it. */
function neighbours(moving: Box, row: Box[], axis: Axis, limit: number) {
  const m = span(moving, axis)
  let before: Box | null = null
  let after: Box | null = null
  for (const b of row) {
    const s = span(b, axis)
    if (s.hi <= m.lo + limit && (!before || s.hi > span(before, axis).hi)) before = b
    if (s.lo >= m.hi - limit && (!after || s.lo < span(after, axis).lo)) after = b
  }
  return { before, after }
}

/**
 * The nearest equal-spacing snap on one axis: centred between its two
 * neighbours, or the gap to a neighbour matching a gap already in the row.
 */
function nearestSpacing(moving: Box, targets: readonly GuideTarget[], axis: Axis, limit: number): Match | null {
  const row = rowOf(moving, targets, axis)
  if (row.length === 0) return null
  const { before, after } = neighbours(moving, row, axis, limit)
  const m = span(moving, axis)
  const length = m.hi - m.lo
  let best: Match | null = null
  const consider = (delta: number) => {
    if (Math.abs(delta) <= limit && better(best, { delta, rank: 1 })) best = { delta, rank: 1 }
  }
  if (before && after) {
    const free = span(after, axis).lo - span(before, axis).hi - length
    if (free > 0) consider(span(before, axis).hi + free / 2 - m.lo)
  }
  for (const gap of rowGaps(row, axis)) {
    if (gap.size <= 0) continue
    if (before) consider(span(before, axis).hi + gap.size - m.lo)
    if (after) consider(span(after, axis).lo - gap.size - m.hi)
  }
  return best
}

/** Markers for the (already snapped) moving box's gaps and every equal gap in its row. */
function spacingMeasures(moving: Box, targets: readonly GuideTarget[], axis: Axis): Measure[] {
  const row = rowOf(moving, targets, axis)
  const { before, after } = neighbours(moving, row, axis, 0)
  const m = span(moving, axis)
  const own: Gap[] = []
  if (before) own.push({ a: before, b: moving, size: m.lo - span(before, axis).hi })
  if (after) own.push({ a: moving, b: after, size: span(after, axis).lo - m.hi })
  const all = [...own, ...rowGaps(row, axis)]
  const out: Measure[] = []
  const seen = new Set<string>()
  for (const g of own) {
    if (g.size <= 0) continue
    const equal = all.filter((o) => o !== g && Math.abs(o.size - g.size) <= 1e-3)
    if (equal.length === 0) continue
    for (const e of [g, ...equal]) {
      const from = span(e.a, axis).hi
      const key = `${from}:${e.size}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ kind: 'gap', axis, from, to: from + e.size, at: markerAt(e.a, e.b, axis), value: e.size })
    }
  }
  return out
}

/* ---------- Dragging ---------- */

function gridDelta(value: number, grid: number) {
  return grid > 0 ? Math.round(value / grid) * grid - value : 0
}

/**
 * Where a dragged box (or the combined box of a dragged selection) should
 * snap. Per axis, the nearest guide within the threshold wins; otherwise the
 * grid applies (if on). Returns the offset to add and what to draw.
 */
export function computeGuides(moving: Box, candidates: readonly GuideTarget[], options: GuideOptions): GuideResult {
  const { zoom, threshold = DEFAULT_THRESHOLD, guides = true, centres = [], equalSpacing = true, grid = 0 } = options
  const anchor = options.gridAnchor ?? { x: moving.x, y: moving.y }
  const limit = threshold / Math.max(zoom, EPS)

  const pick = (axis: Axis): { delta: number; source: SnapSource; spacing: boolean } => {
    if (guides) {
      let best = nearestAlignment(moving, candidates, centres, axis, limit)
      const spaced = equalSpacing ? nearestSpacing(moving, candidates, axis, limit) : null
      if (spaced && better(best, spaced)) best = spaced
      if (best) return { delta: best.delta, source: 'guide', spacing: best.rank === 1 }
    }
    const delta = gridDelta(axis === 'x' ? anchor.x : anchor.y, grid)
    return { delta, source: grid > 0 ? 'grid' : null, spacing: false }
  }
  const x = pick('x')
  const y = pick('y')
  const snapped = shift(moving, x.delta, y.delta)

  const aligned = new Map<string, GuideTarget>()
  const lines: GuideLine[] = []
  const measures: Measure[] = []
  for (const [axis, choice] of [['x', x], ['y', y]] as const) {
    if (choice.source !== 'guide') continue
    lines.push(...alignedLines(snapped, candidates, centres, axis, aligned))
    if (equalSpacing) measures.push(...spacingMeasures(snapped, candidates, axis))
  }
  return { dx: x.delta, dy: y.delta, snapX: x.source, snapY: y.source, lines, measures, aligned: [...aligned.values()] }
}

/* ---------- Resizing ---------- */

/** Which edges a resize handle moves. */
export interface ResizeEdges {
  left: boolean
  right: boolean
  top: boolean
  bottom: boolean
}

export interface ResizeGuideOptions extends Omit<GuideOptions, 'gridAnchor' | 'centres'> {
  minSize?: { width: number; height: number }
}

export interface ResizeGuideResult extends Omit<GuideResult, 'dx' | 'dy'> {
  box: Box
}

/**
 * Snaps the moving edge(s) of a box being resized: to the nearest target
 * edge or centre line, or to a matching width or height, within the
 * threshold; otherwise to the grid. The opposite edge stays put.
 */
export function computeResizeGuides(box: Box, edges: ResizeEdges, candidates: readonly GuideTarget[], options: ResizeGuideOptions): ResizeGuideResult {
  const { zoom, threshold = DEFAULT_THRESHOLD, guides = true, grid = 0, minSize = { width: 1, height: 1 } } = options
  const limit = threshold / Math.max(zoom, EPS)
  const out = { ...box }
  const snaps: Record<Axis, SnapSource> = { x: null, y: null }

  for (const axis of ['x', 'y'] as const) {
    const [lowEdge, highEdge] = axis === 'x' ? [edges.left, edges.right] : [edges.top, edges.bottom]
    // A handle moves one edge per axis; anything else isn't a resize we understand.
    if (lowEdge === highEdge) continue
    const { lo, hi } = span(box, axis)
    const length = hi - lo
    const min = axis === 'x' ? minSize.width : minSize.height
    const edge = lowEdge ? lo : hi
    // A delta for the moving edge; keeps the minimum size.
    const fits = (delta: number) => (lowEdge ? length - delta : length + delta) >= min - EPS
    // Rank 0: edge meets a target line. Rank 1: size matches a target's size.
    let best: Match | null = null
    const consider = (delta: number, rank: number) => {
      if (Math.abs(delta) <= limit && fits(delta) && better(best, { delta, rank })) best = { delta, rank }
    }
    if (guides) {
      for (const t of candidates) {
        for (const line of linesOf(t.box, axis)) consider(line - edge, 0)
        const s = span(t.box, axis)
        consider(lowEdge ? length - (s.hi - s.lo) : s.hi - s.lo - length, 1)
      }
    }
    let delta = 0
    if (best) {
      delta = (best as Match).delta
      snaps[axis] = 'guide'
    } else if (grid > 0) {
      const g = gridDelta(edge, grid)
      if (fits(g)) {
        delta = g
        snaps[axis] = 'grid'
      }
    }
    if (axis === 'x') {
      if (lowEdge) out.x += delta
      out.width = lowEdge ? length - delta : length + delta
    } else {
      if (lowEdge) out.y += delta
      out.height = lowEdge ? length - delta : length + delta
    }
  }

  const aligned = new Map<string, GuideTarget>()
  const lines: GuideLine[] = []
  const measures: Measure[] = []
  for (const axis of ['x', 'y'] as const) {
    if (snaps[axis] !== 'guide') continue
    const [lowEdge] = axis === 'x' ? [edges.left] : [edges.top]
    const { lo, hi } = span(out, axis)
    const edge = lowEdge ? lo : hi
    // Only the moving edge draws alignment lines; the fixed edge was already there.
    const edgeBox: Box = axis === 'x' ? { ...out, x: edge, width: 0 } : { ...out, y: edge, height: 0 }
    for (const line of alignedLines(edgeBox, candidates, [], axis, aligned)) lines.push({ ...line, kind: 'edge' })
    const length = hi - lo
    const matches = candidates.filter((t) => {
      const s = span(t.box, axis)
      return Math.abs(s.hi - s.lo - length) <= 1e-3
    })
    if (matches.length === 0) continue
    // Size markers along the top (widths) or left (heights) of the box and each match.
    for (const b of [out, ...matches.map((t) => t.box)]) {
      const s = span(b, axis)
      measures.push({ kind: 'size', axis, from: s.lo, to: s.hi, at: span(b, cross(axis)).lo, value: length })
    }
    for (const t of matches) aligned.set(t.id, t)
  }
  return { box: out, snapX: snaps.x, snapY: snaps.y, lines, measures, aligned: [...aligned.values()] }
}
