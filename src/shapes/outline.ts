import type { Box, Point, Side } from './types'

/* Small geometry helpers for shape outlines and attachment points. */

export const r2 = (value: number) => Math.round(value * 100) / 100

/** Midpoint of a box side, in the box's own coordinates. */
export function boxSidePoint(width: number, height: number, side: Side): Point {
  switch (side) {
    case 'top':
      return { x: width / 2, y: 0 }
    case 'right':
      return { x: width, y: height / 2 }
    case 'bottom':
      return { x: width / 2, y: height }
    case 'left':
      return { x: 0, y: height / 2 }
  }
}

export function rectOutline(width: number, height: number): Point[] {
  return [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ]
}

/** Points along a cubic Bézier (excluding the start). */
export function sampleCubic(p0: Point, p1: Point, p2: Point, p3: Point, steps = 12): Point[] {
  const out: Point[] = []
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    const u = 1 - t
    out.push({
      x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
      y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
    })
  }
  return out
}

/** Points along a quadratic Bézier (excluding the start). */
export function sampleQuad(p0: Point, p1: Point, p2: Point, steps = 12): Point[] {
  const out: Point[] = []
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    const u = 1 - t
    out.push({ x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x, y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y })
  }
  return out
}

export function sampleEllipse(cx: number, cy: number, rx: number, ry: number, steps = 48): Point[] {
  return Array.from({ length: steps }, (_, i) => {
    const a = (i / steps) * Math.PI * 2
    return { x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) }
  })
}

/** Distance from a point to a closed polygon's edges. */
export function distanceToOutline(point: Point, outline: readonly Point[]): number {
  let best = Infinity
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i]!
    const b = outline[(i + 1) % outline.length]!
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len2 = dx * dx + dy * dy
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / len2))
    best = Math.min(best, Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy)))
  }
  return best
}

/**
 * The outline point furthest towards a side (topmost for 'top', and so on);
 * where several tie, the one closest to the side's middle.
 */
export function extremePoint(outline: readonly Point[], side: Side, width: number, height: number): Point {
  const score = (p: Point) => (side === 'top' ? -p.y : side === 'bottom' ? p.y : side === 'left' ? -p.x : p.x)
  const middle = (p: Point) => (side === 'top' || side === 'bottom' ? Math.abs(p.x - width / 2) : Math.abs(p.y - height / 2))
  let best = outline[0]!
  for (const p of outline) {
    const d = score(p) - score(best)
    if (d > 0.01 || (Math.abs(d) <= 0.01 && middle(p) < middle(best))) best = p
  }
  return best
}

export const boxContains = (outer: Box, inner: Box, tolerance = 0.01) =>
  inner.x >= outer.x - tolerance &&
  inner.y >= outer.y - tolerance &&
  inner.x + inner.width <= outer.x + outer.width + tolerance &&
  inner.y + inner.height <= outer.y + outer.height + tolerance
