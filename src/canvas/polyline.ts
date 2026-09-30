import type { Position as Point } from '@/schema/diagram'

/**
 * SVG path through `points`. With a radius, corners are rounded (never by
 * more than half of either neighbouring segment).
 */
export function polylinePath(points: Point[], radius = 0): string {
  if (points.length === 0) return ''
  let d = `M${points[0]!.x} ${points[0]!.y}`
  for (let i = 1; i < points.length; i++) {
    const p = points[i]!
    const prev = points[i - 1]!
    const next = points[i + 1]
    if (!next || radius <= 0) {
      d += `L${p.x} ${p.y}`
      continue
    }
    const inLen = Math.hypot(p.x - prev.x, p.y - prev.y)
    const outLen = Math.hypot(next.x - p.x, next.y - p.y)
    const r = Math.min(radius, inLen / 2, outLen / 2)
    const a = { x: p.x - ((p.x - prev.x) / inLen) * r, y: p.y - ((p.y - prev.y) / inLen) * r }
    const b = { x: p.x + ((next.x - p.x) / outLen) * r, y: p.y + ((next.y - p.y) / outLen) * r }
    d += `L${a.x} ${a.y}Q${p.x} ${p.y} ${b.x} ${b.y}`
  }
  return d
}

/** The point halfway along the polyline, for placing a label. */
export function polylineMidpoint(points: Point[]): Point {
  if (points.length === 0) return { x: 0, y: 0 }
  const lengths = points.slice(1).map((p, i) => Math.hypot(p.x - points[i]!.x, p.y - points[i]!.y))
  let remaining = lengths.reduce((a, b) => a + b, 0) / 2
  for (let i = 0; i < lengths.length; i++) {
    const len = lengths[i]!
    if (remaining <= len && len > 0) {
      const a = points[i]!
      const b = points[i + 1]!
      return { x: a.x + ((b.x - a.x) * remaining) / len, y: a.y + ((b.y - a.y) * remaining) / len }
    }
    remaining -= len
  }
  return points.at(-1)!
}
