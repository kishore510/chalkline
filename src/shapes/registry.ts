import { Cloud, Database, RectangleHorizontal, Square, Type, User } from 'lucide-react'
import type { Size } from '@/schema/diagram'
import { boxSidePoint, r2, rectOutline, sampleCubic } from './outline'
import { SIDES, type Box, type Point, type ShapeCategory, type ShapeDefinition, type Side } from './types'

/*
 * The shape registry: every shape the editor can draw. Adding a shape means
 * adding an entry here (plus its tests); nothing else switches on shape ids.
 */

const n = r2
const full = (w: number, h: number): Box => ({ x: 0, y: 0, width: w, height: h })
const MIN: Size = { width: 24, height: 24 }
const midpoints = (size: Size, side: Side) => boxSidePoint(size.width, size.height, side)

/* ---------- Basic ---------- */

const rectangle: ShapeDefinition = {
  id: 'rectangle',
  name: 'Rectangle',
  category: 'basic',
  icon: Square,
  defaultSize: { width: 160, height: 80 },
  minSize: MIN,
  keepAspect: false,
  defaultLabel: 'Service',
  defaultStyle: {},
  geometry: ({ width: w, height: h }) => ({ body: [`M0 0H${n(w)}V${n(h)}H0Z`], detail: [], extent: full(w, h) }),
  label: ({ width: w, height: h }) => ({ box: full(w, h), fit: 'contain', align: 'center' }),
  outline: ({ width, height }) => rectOutline(width, height),
  sides: SIDES,
  anchor: midpoints,
  spreadSides: SIDES,
}

// Corner radius for the rounded box, capped so small boxes still look right.
const ROUNDED_RADIUS = 12

const rounded: ShapeDefinition = {
  ...rectangle,
  id: 'rounded',
  name: 'Rounded box',
  icon: RectangleHorizontal,
  defaultLabel: 'Process',
  geometry: ({ width: w, height: h }) => {
    const r = n(Math.min(ROUNDED_RADIUS, w / 4, h / 4))
    const [W, H] = [n(w), n(h)]
    const d =
      `M${r} 0H${n(w - r)}A${r} ${r} 0 0 1 ${W} ${r}V${n(h - r)}A${r} ${r} 0 0 1 ${n(w - r)} ${H}` +
      `H${r}A${r} ${r} 0 0 1 0 ${n(h - r)}V${r}A${r} ${r} 0 0 1 ${r} 0Z`
    return { body: [d], detail: [], extent: full(w, h) }
  },
}

const cylinderRy = (w: number, h: number) => n(Math.min(h * 0.12, w * 0.2))

const database: ShapeDefinition = {
  ...rectangle,
  id: 'database',
  name: 'Database',
  category: 'architecture',
  icon: Database,
  defaultSize: { width: 120, height: 100 },
  defaultLabel: 'Database',
  geometry: ({ width: w, height: h }) => {
    const rx = n(w / 2)
    const ry = cylinderRy(w, h)
    const [W, H] = [n(w), n(h)]
    return {
      body: [`M0 ${ry}A${rx} ${ry} 0 0 1 ${W} ${ry}V${n(H - ry)}A${rx} ${ry} 0 0 1 0 ${n(H - ry)}Z`],
      detail: [`M0 ${ry}A${rx} ${ry} 0 0 0 ${W} ${ry}`],
      extent: full(w, h),
    }
  },
  label: ({ width: w, height: h }) => {
    const ry = cylinderRy(w, h)
    return { box: { x: 0, y: 2 * ry, width: w, height: Math.max(0, h - 3 * ry) }, fit: 'contain', align: 'center' }
  },
}

// Cloud outline in unit space; every control point stays inside [0, 1] so the
// curve (which lies inside its control hull) never leaves the node box.
const CLOUD: [number, number][][] = [
  [[0.24, 0.94]],
  [[0.06, 0.94], [0, 0.66], [0.14, 0.56]],
  [[0.06, 0.3], [0.28, 0.14], [0.4, 0.26]],
  [[0.46, 0], [0.76, 0], [0.76, 0.28]],
  [[0.94, 0.22], [1, 0.46], [0.9, 0.56]],
  [[1, 0.72], [0.92, 0.96], [0.76, 0.94]],
  [[0.6, 1], [0.4, 1], [0.24, 0.94]],
]

function cloudOutline(w: number, h: number): Point[] {
  const at = ([x, y]: [number, number]): Point => ({ x: x * w, y: y * h })
  const [start, ...curves] = CLOUD
  let current = at(start![0]!)
  const points = [current]
  for (const [c1, c2, end] of curves as [[number, number], [number, number], [number, number]][]) {
    const next = sampleCubic(current, at(c1), at(c2), at(end))
    points.push(...next)
    current = next.at(-1)!
  }
  return points.slice(0, -1)
}

const cloud: ShapeDefinition = {
  ...rectangle,
  id: 'cloud',
  name: 'Cloud',
  category: 'architecture',
  icon: Cloud,
  defaultSize: { width: 180, height: 110 },
  defaultLabel: 'Cloud',
  geometry: ({ width: w, height: h }) => {
    const pt = ([x, y]: [number, number]) => `${n(x * w)} ${n(y * h)}`
    const [start, ...curves] = CLOUD
    const d = `M${pt(start![0]!)}` + curves.map((c) => `C${c.map(pt).join(' ')}`).join('') + 'Z'
    return { body: [d], detail: [], extent: full(w, h) }
  },
  label: ({ width: w, height: h }) => ({ box: { x: w * 0.14, y: h * 0.3, width: w * 0.72, height: h * 0.6 }, fit: 'contain', align: 'center' }),
  outline: ({ width, height }) => cloudOutline(width, height),
}

/** Share of the actor's height used by the figure; the label sits below it. */
export const ACTOR_FIGURE_RATIO = 0.65

function actorFigure(w: number, h: number) {
  const fh = h * ACTOR_FIGURE_RATIO
  // Keep the figure's proportions however wide the node is.
  const fw = Math.min(w, fh * 0.62)
  return { fh, fw, ex: (w - fw) / 2 }
}

const actor: ShapeDefinition = {
  ...rectangle,
  id: 'actor',
  name: 'Actor',
  category: 'basic',
  icon: User,
  defaultSize: { width: 96, height: 128 },
  defaultLabel: 'User',
  geometry: ({ width: w, height: h }) => {
    const { fh, fw, ex } = actorFigure(w, h)
    const cx = n(w / 2)
    const r = n(Math.min(fw * 0.24, fh * 0.15))
    const neck = n(2 * r)
    const hip = n(2 * r + (fh - 2 * r) * 0.5)
    const shoulder = n(2 * r + (fh - 2 * r) * 0.16)
    const arm = fw * 0.46
    const leg = fw * 0.36
    return {
      body: [`M${n(cx - r)} ${r}A${r} ${r} 0 1 1 ${n(cx + r)} ${r}A${r} ${r} 0 1 1 ${n(cx - r)} ${r}Z`],
      detail: [
        `M${cx} ${neck}V${hip}`,
        `M${n(w / 2 - arm)} ${shoulder}H${n(w / 2 + arm)}`,
        `M${n(w / 2 - leg)} ${n(fh)}L${cx} ${hip}L${n(w / 2 + leg)} ${n(fh)}`,
      ],
      extent: { x: ex, y: 0, width: fw, height: fh },
    }
  },
  label: ({ width: w, height: h }) => {
    const fh = h * ACTOR_FIGURE_RATIO
    return { box: { x: 0, y: fh, width: w, height: h - fh }, fit: 'free', align: 'start' }
  },
}

const text: ShapeDefinition = {
  ...rectangle,
  id: 'text',
  name: 'Text',
  category: 'annotation',
  icon: Type,
  defaultSize: { width: 160, height: 40 },
  defaultLabel: 'Text',
  geometry: ({ width: w, height: h }) => ({ body: [], detail: [], extent: full(w, h) }),
  label: ({ width: w, height: h }) => ({ box: full(w, h), fit: 'free', align: 'center' }),
}

/* ---------- Registry ---------- */

export const SHAPES: readonly ShapeDefinition[] = [rectangle, rounded, database, cloud, actor, text]

const byId = new Map(SHAPES.map((s) => [s.id, s]))

export const SHAPE_IDS: readonly string[] = SHAPES.map((s) => s.id)

export const CATEGORIES: readonly { id: ShapeCategory; name: string }[] = [
  { id: 'basic', name: 'Basic' },
  { id: 'process', name: 'Process' },
  { id: 'architecture', name: 'Architecture' },
  { id: 'annotation', name: 'Annotation' },
]

export function isKnownShape(id: string): boolean {
  return byId.has(id)
}

/** The shape for an id. Unknown ids (e.g. from a newer app) draw as a plain rectangle. */
export function getShape(id: string | undefined): ShapeDefinition {
  return (id !== undefined && byId.get(id)) || rectangle
}

/** Absolute attachment point of a node side: on the shape's outline, or a box's side midpoint. */
export function anchorPoint(item: { type?: string; position: Point; size: Size }, side: Side): Point {
  const local = item.type === undefined ? boxSidePoint(item.size.width, item.size.height, side) : getShape(item.type).anchor(item.size, side)
  return { x: item.position.x + local.x, y: item.position.y + local.y }
}
