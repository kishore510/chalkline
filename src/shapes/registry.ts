import {
  ArrowLeftRight,
  Cloud,
  Database,
  Diamond,
  Ellipse,
  FileText,
  GalleryHorizontal,
  Hexagon,
  MessageSquare,
  RectangleHorizontal,
  Server,
  Square,
  StickyNote,
  Type,
  User,
  Users,
} from 'lucide-react'
import type { Size } from '@/schema/diagram'
import { boxSidePoint, extremePoint, r2, rectOutline, sampleCubic, sampleEllipse } from './outline'
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
  // Curved caps top and bottom: only the straight sides take several connectors.
  spreadSides: ['left', 'right'],
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
  // Attach at the outermost bump on each side, not the bounding box.
  anchor: ({ width, height }, side) => extremePoint(cloudOutline(width, height), side, width, height),
  spreadSides: [],
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
  // The figure above, the label band below.
  outline: ({ width: w, height: h }) => figureOutline(w, h, actorFigure(w, h)),
  anchor: ({ width: w, height: h }, side) => figureAnchor(w, h, actorFigure(w, h), 0, side),
  spreadSides: [],
}

/** Outline of a figure (actor or user group) standing on its label band. */
function figureOutline(w: number, h: number, f: { fh: number; fw: number; ex: number; top?: number }): Point[] {
  const top = f.top ?? 0
  return [
    { x: f.ex, y: top },
    { x: f.ex + f.fw, y: top },
    { x: f.ex + f.fw, y: f.fh },
    { x: w, y: f.fh },
    { x: w, y: h },
    { x: 0, y: h },
    { x: 0, y: f.fh },
    { x: f.ex, y: f.fh },
  ]
}

function figureAnchor(w: number, h: number, f: { fh: number; fw: number; ex: number }, top: number, side: Side): Point {
  switch (side) {
    case 'top':
      return { x: w / 2, y: top }
    case 'bottom':
      return { x: w / 2, y: h }
    case 'left':
      return { x: f.ex, y: (top + f.fh) / 2 }
    case 'right':
      return { x: f.ex + f.fw, y: (top + f.fh) / 2 }
  }
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


/* ---------- Process ---------- */

const polygon = (points: Point[]) => `M${points.map((p) => `${n(p.x)} ${n(p.y)}`).join('L')}Z`

const diamond: ShapeDefinition = {
  ...rectangle,
  id: 'diamond',
  name: 'Decision',
  category: 'process',
  icon: Diamond,
  defaultSize: { width: 140, height: 100 },
  minSize: { width: 48, height: 36 },
  defaultLabel: 'Decision',
  geometry: ({ width: w, height: h }) => ({ body: [polygon(diamondPoints(w, h))], detail: [], extent: full(w, h) }),
  // The largest rectangle inside a diamond is half its width and height.
  label: ({ width: w, height: h }) => ({ box: { x: w / 4, y: h / 4, width: w / 2, height: h / 2 }, fit: 'contain', align: 'center' }),
  outline: ({ width: w, height: h }) => diamondPoints(w, h),
  // The side midpoints of the box are exactly the diamond's vertices.
  anchor: midpoints,
  spreadSides: [],
}

function diamondPoints(w: number, h: number): Point[] {
  return [
    { x: w / 2, y: 0 },
    { x: w, y: h / 2 },
    { x: w / 2, y: h },
    { x: 0, y: h / 2 },
  ]
}

const ellipse: ShapeDefinition = {
  ...rectangle,
  id: 'ellipse',
  name: 'Ellipse',
  category: 'process',
  icon: Ellipse,
  defaultSize: { width: 150, height: 90 },
  minSize: { width: 48, height: 32 },
  defaultLabel: 'Start',
  geometry: ({ width: w, height: h }) => {
    const [rx, ry] = [n(w / 2), n(h / 2)]
    return { body: [`M0 ${ry}A${rx} ${ry} 0 1 1 ${n(w)} ${ry}A${rx} ${ry} 0 1 1 0 ${ry}Z`], detail: [], extent: full(w, h) }
  },
  // The rectangle inscribed in an ellipse: 1/sqrt(2) of each axis.
  label: ({ width: w, height: h }) => {
    const k = Math.SQRT1_2
    return { box: { x: (w * (1 - k)) / 2, y: (h * (1 - k)) / 2, width: w * k, height: h * k }, fit: 'contain', align: 'center' }
  },
  outline: ({ width: w, height: h }) => sampleEllipse(w / 2, h / 2, w / 2, h / 2),
  anchor: midpoints,
  spreadSides: [],
}

const hexInset = (w: number, h: number) => Math.min(w / 4, h / 2)

const hexagon: ShapeDefinition = {
  ...rectangle,
  id: 'hexagon',
  name: 'Hexagon',
  category: 'process',
  icon: Hexagon,
  defaultSize: { width: 160, height: 80 },
  minSize: { width: 60, height: 32 },
  defaultLabel: 'Preparation',
  geometry: ({ width: w, height: h }) => ({ body: [polygon(hexagonPoints(w, h))], detail: [], extent: full(w, h) }),
  label: ({ width: w, height: h }) => {
    const i = hexInset(w, h)
    return { box: { x: i, y: 0, width: w - 2 * i, height: h }, fit: 'contain', align: 'center' }
  },
  outline: ({ width: w, height: h }) => hexagonPoints(w, h),
  // Flat top and bottom edges; pointed left and right vertices at mid-height.
  anchor: midpoints,
  spreadSides: ['top', 'bottom'],
}

function hexagonPoints(w: number, h: number): Point[] {
  const i = hexInset(w, h)
  return [
    { x: i, y: 0 },
    { x: w - i, y: 0 },
    { x: w, y: h / 2 },
    { x: w - i, y: h },
    { x: i, y: h },
    { x: 0, y: h / 2 },
  ]
}

const skewOf = (w: number, h: number) => Math.min(w * 0.2, h * 0.6)

const parallelogram: ShapeDefinition = {
  ...rectangle,
  id: 'parallelogram',
  name: 'Input / output',
  category: 'process',
  icon: ArrowLeftRight,
  defaultSize: { width: 160, height: 80 },
  minSize: { width: 60, height: 32 },
  defaultLabel: 'Input',
  geometry: ({ width: w, height: h }) => ({ body: [polygon(parallelogramPoints(w, h))], detail: [], extent: full(w, h) }),
  label: ({ width: w, height: h }) => {
    const s = skewOf(w, h)
    return { box: { x: s, y: 0, width: w - 2 * s, height: h }, fit: 'contain', align: 'center' }
  },
  outline: ({ width: w, height: h }) => parallelogramPoints(w, h),
  // Left and right attach on the slanted edges at mid-height.
  anchor: ({ width: w, height: h }, side) => {
    const s = skewOf(w, h)
    if (side === 'left') return { x: s / 2, y: h / 2 }
    if (side === 'right') return { x: w - s / 2, y: h / 2 }
    return boxSidePoint(w, h, side)
  },
  spreadSides: ['top', 'bottom'],
}

function parallelogramPoints(w: number, h: number): Point[] {
  const s = skewOf(w, h)
  return [
    { x: s, y: 0 },
    { x: w, y: 0 },
    { x: w - s, y: h },
    { x: 0, y: h },
  ]
}

const waveOf = (h: number) => Math.min(h * 0.12, 14)

const documentShape: ShapeDefinition = {
  ...rectangle,
  id: 'document',
  name: 'Document',
  category: 'process',
  icon: FileText,
  defaultSize: { width: 160, height: 90 },
  minSize: { width: 60, height: 40 },
  defaultLabel: 'Document',
  geometry: ({ width: w, height: h }) => {
    const a = waveOf(h)
    // Wavy bottom: a crest between the right and the middle, a trough between the middle and the left.
    // Control points stay inside the box, so the curve does too.
    const d =
      `M0 0H${n(w)}V${n(h - a)}C${n(w * 0.83)} ${n(h - 2 * a)} ${n(w * 0.67)} ${n(h - 2 * a)} ${n(w / 2)} ${n(h - a)}` +
      `C${n(w * 0.33)} ${n(h)} ${n(w * 0.17)} ${n(h)} 0 ${n(h - a)}Z`
    return { body: [d], detail: [], extent: full(w, h) }
  },
  label: ({ width: w, height: h }) => ({ box: { x: 0, y: 0, width: w, height: h - 2 * waveOf(h) }, fit: 'contain', align: 'center' }),
  outline: ({ width: w, height: h }) => {
    const a = waveOf(h)
    const right = { x: w, y: h - a }
    const middle = { x: w / 2, y: h - a }
    return [
      { x: 0, y: 0 },
      { x: w, y: 0 },
      right,
      ...sampleCubic(right, { x: w * 0.83, y: h - 2 * a }, { x: w * 0.67, y: h - 2 * a }, middle),
      ...sampleCubic(middle, { x: w * 0.33, y: h }, { x: w * 0.17, y: h }, { x: 0, y: h - a }).slice(0, -1),
      { x: 0, y: h - a },
    ]
  },
  anchor: ({ width: w, height: h }, side) => {
    const a = waveOf(h)
    if (side === 'bottom') return { x: w / 2, y: h - a }
    if (side === 'left') return { x: 0, y: (h - a) / 2 }
    if (side === 'right') return { x: w, y: (h - a) / 2 }
    return boxSidePoint(w, h, side)
  },
  spreadSides: ['top', 'left', 'right'],
}

/* ---------- Architecture ---------- */

const circle = (cx: number, cy: number, r: number) => `M${n(cx - r)} ${n(cy)}A${n(r)} ${n(r)} 0 1 1 ${n(cx + r)} ${n(cy)}A${n(r)} ${n(r)} 0 1 1 ${n(cx - r)} ${n(cy)}Z`
const roundedRect = (x: number, y: number, w: number, h: number, radius: number) => {
  const r = Math.min(radius, w / 2, h / 2)
  return (
    `M${n(x + r)} ${n(y)}H${n(x + w - r)}A${n(r)} ${n(r)} 0 0 1 ${n(x + w)} ${n(y + r)}V${n(y + h - r)}A${n(r)} ${n(r)} 0 0 1 ${n(x + w - r)} ${n(y + h)}` +
    `H${n(x + r)}A${n(r)} ${n(r)} 0 0 1 ${n(x)} ${n(y + h - r)}V${n(y + r)}A${n(r)} ${n(r)} 0 0 1 ${n(x + r)} ${n(y)}Z`
  )
}

/** Share of a server's height taken by its rack units; the label goes below. */
const RACK_RATIO = 0.6

const server: ShapeDefinition = {
  ...rectangle,
  id: 'server',
  name: 'Server',
  category: 'architecture',
  icon: Server,
  defaultSize: { width: 140, height: 120 },
  minSize: { width: 60, height: 60 },
  defaultLabel: 'Server',
  geometry: ({ width: w, height: h }) => {
    const rack = h * RACK_RATIO
    const unit = rack / 3
    const lightX = Math.min(14, w * 0.12)
    const port = Math.min(unit * 0.16, 5, lightX * 0.8)
    const detail: string[] = []
    for (let i = 0; i < 3; i++) {
      const mid = unit * i + unit / 2
      // A status light and a drive slot on each rack unit.
      detail.push(circle(lightX, mid, port))
      detail.push(`M${n(w * 0.42)} ${n(mid)}H${n(w - Math.min(14, w * 0.12))}`)
      detail.push(`M0 ${n(unit * (i + 1))}H${n(w)}`)
    }
    return { body: [roundedRect(0, 0, w, h, 8)], detail, extent: full(w, h) }
  },
  label: ({ width: w, height: h }) => ({ box: { x: 0, y: h * RACK_RATIO, width: w, height: h * (1 - RACK_RATIO) }, fit: 'contain', align: 'center' }),
}

const capOf = (w: number, h: number) => Math.min(h / 2, w / 2)
const slotGap = (w: number, h: number) => Math.min(16, Math.max(0, w - 2 * capOf(w, h)) / 6)

const queue: ShapeDefinition = {
  ...rectangle,
  id: 'queue',
  name: 'Queue',
  category: 'architecture',
  icon: GalleryHorizontal,
  defaultSize: { width: 180, height: 60 },
  minSize: { width: 90, height: 32 },
  defaultLabel: 'Queue',
  geometry: ({ width: w, height: h }) => {
    const r = capOf(w, h)
    const gap = slotGap(w, h)
    // Three divisions towards the outgoing end, like messages waiting in a pipe.
    const detail = [1, 2, 3].map((k) => `M${n(w - r - k * gap)} 0V${n(h)}`)
    return { body: [roundedRect(0, 0, w, h, r)], detail, extent: full(w, h) }
  },
  label: ({ width: w, height: h }) => {
    const r = capOf(w, h)
    const x = r * 0.5
    return { box: { x, y: 0, width: Math.max(0, w - r - 3 * slotGap(w, h) - x), height: h }, fit: 'contain', align: 'center' }
  },
  outline: ({ width: w, height: h }) => {
    const r = capOf(w, h)
    const right = sampleEllipse(w - r, h / 2, r, r, 24).filter((p) => p.x >= w - r - 0.01)
    const left = sampleEllipse(r, h / 2, r, r, 24).filter((p) => p.x <= r + 0.01)
    return [{ x: r, y: 0 }, { x: w - r, y: 0 }, ...right.sort((p, q) => p.y - q.y), { x: w - r, y: h }, { x: r, y: h }, ...left.sort((p, q) => q.y - p.y)]
  },
  spreadSides: ['top', 'bottom'],
}

/** Three overlapping busts: two behind, one in front. */
function groupFigure(w: number, h: number) {
  const fh = h * ACTOR_FIGURE_RATIO
  const front = Math.min(fh / 4.2, w / 6.5)
  const back = front * 0.8
  const spread = front * 1.5
  const fw = 2 * (spread + 1.7 * back)
  return { fh, front, back, spread, fw: Math.min(fw, w), ex: (w - Math.min(fw, w)) / 2, top: fh - 3.8 * front }
}

function bust(cx: number, bottom: number, r: number): string[] {
  const top = bottom - 3.8 * r
  return [
    `M${n(cx - 1.7 * r)} ${n(bottom)}C${n(cx - 1.7 * r)} ${n(top + 2.2 * r)} ${n(cx + 1.7 * r)} ${n(top + 2.2 * r)} ${n(cx + 1.7 * r)} ${n(bottom)}Z`,
    circle(cx, top + r, r),
  ]
}

const userGroup: ShapeDefinition = {
  ...rectangle,
  id: 'user-group',
  name: 'User group',
  category: 'architecture',
  icon: Users,
  defaultSize: { width: 128, height: 128 },
  minSize: { width: 64, height: 64 },
  defaultLabel: 'Users',
  geometry: ({ width: w, height: h }) => {
    const f = groupFigure(w, h)
    // Back figures first so the front one overlaps them.
    const body = [...bust(w / 2 - f.spread, f.fh, f.back), ...bust(w / 2 + f.spread, f.fh, f.back), ...bust(w / 2, f.fh, f.front)]
    return { body, detail: [], extent: { x: f.ex, y: f.top, width: f.fw, height: f.fh - f.top } }
  },
  label: ({ width: w, height: h }) => {
    const fh = h * ACTOR_FIGURE_RATIO
    return { box: { x: 0, y: fh, width: w, height: h - fh }, fit: 'free', align: 'start' }
  },
  outline: ({ width: w, height: h }) => figureOutline(w, h, groupFigure(w, h)),
  anchor: ({ width: w, height: h }, side) => {
    const f = groupFigure(w, h)
    return figureAnchor(w, h, f, f.top, side)
  },
  spreadSides: [],
}

/* ---------- Annotation ---------- */

const foldOf = (w: number, h: number) => Math.min(w, h) * 0.18

const sticky: ShapeDefinition = {
  ...rectangle,
  id: 'sticky-note',
  name: 'Sticky note',
  category: 'annotation',
  icon: StickyNote,
  defaultSize: { width: 150, height: 150 },
  minSize: { width: 60, height: 60 },
  defaultLabel: 'Note',
  // Warm preset that is contrast-checked in both themes.
  defaultStyle: { fill: 'token:swatch-amber-soft', stroke: 'token:swatch-amber' },
  geometry: ({ width: w, height: h }) => {
    const f = foldOf(w, h)
    return {
      body: [`M0 0H${n(w)}V${n(h - f)}L${n(w - f)} ${n(h)}H0Z`],
      detail: [`M${n(w)} ${n(h - f)}H${n(w - f)}V${n(h)}`],
      extent: full(w, h),
    }
  },
  label: ({ width: w, height: h }) => ({ box: { x: 0, y: 0, width: w, height: h - foldOf(w, h) }, fit: 'contain', align: 'center' }),
  outline: ({ width: w, height: h }) => {
    const f = foldOf(w, h)
    return [
      { x: 0, y: 0 },
      { x: w, y: 0 },
      { x: w, y: h - f },
      { x: w - f, y: h },
      { x: 0, y: h },
    ]
  },
  spreadSides: ['top', 'left'],
}

const tailOf = (h: number) => Math.min(h * 0.25, 22)

const callout: ShapeDefinition = {
  ...rectangle,
  id: 'callout',
  name: 'Callout',
  category: 'annotation',
  icon: MessageSquare,
  defaultSize: { width: 170, height: 100 },
  minSize: { width: 80, height: 50 },
  defaultLabel: 'Callout',
  geometry: ({ width: w, height: h }) => {
    const bh = h - tailOf(h)
    const r = Math.min(10, bh / 4, w / 4)
    const [a, b, tip] = [w * 0.2, w * 0.34, w * 0.14]
    const d =
      `M${n(r)} 0H${n(w - r)}A${n(r)} ${n(r)} 0 0 1 ${n(w)} ${n(r)}V${n(bh - r)}A${n(r)} ${n(r)} 0 0 1 ${n(w - r)} ${n(bh)}` +
      `H${n(b)}L${n(tip)} ${n(h)}L${n(a)} ${n(bh)}H${n(r)}A${n(r)} ${n(r)} 0 0 1 0 ${n(bh - r)}V${n(r)}A${n(r)} ${n(r)} 0 0 1 ${n(r)} 0Z`
    return { body: [d], detail: [], extent: full(w, h) }
  },
  label: ({ width: w, height: h }) => ({ box: { x: 0, y: 0, width: w, height: h - tailOf(h) }, fit: 'contain', align: 'center' }),
  outline: ({ width: w, height: h }) => {
    const bh = h - tailOf(h)
    return [
      { x: 0, y: 0 },
      { x: w, y: 0 },
      { x: w, y: bh },
      { x: w * 0.34, y: bh },
      { x: w * 0.14, y: h },
      { x: w * 0.2, y: bh },
      { x: 0, y: bh },
    ]
  },
  // The tail stays where it is; connectors attach to the box.
  anchor: ({ width: w, height: h }, side) => {
    const bh = h - tailOf(h)
    if (side === 'bottom') return { x: w / 2, y: bh }
    if (side === 'left') return { x: 0, y: bh / 2 }
    if (side === 'right') return { x: w, y: bh / 2 }
    return boxSidePoint(w, h, side)
  },
  spreadSides: ['top', 'left', 'right'],
}

/* ---------- Registry ---------- */

export const SHAPES: readonly ShapeDefinition[] = [
  // Basic
  rectangle,
  rounded,
  actor,
  // Process
  diamond,
  ellipse,
  hexagon,
  parallelogram,
  documentShape,
  // Architecture
  database,
  cloud,
  server,
  queue,
  userGroup,
  // Annotation
  text,
  sticky,
  callout,
]

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
