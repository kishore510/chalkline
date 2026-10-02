import type { Size } from '@/schema/diagram'
import { outlineIcon } from './glyphIcon'
import { boxSidePoint, r2 as n, rectOutline, sampleCubic, sampleEllipse } from './outline'
import { polygon } from './paths'
import { SIDES, type Box, type Point, type ShapeCategory, type ShapeDefinition, type ShapeGeometry, type Side } from './types'

/*
 * Shapes pack 4: basic geometry, more flowchart shapes and block arrows. All
 * are plain outlines drawn here from simple geometry. Each has no glyph; its
 * palette icon is its own outline at its default size (outlineIcon), so the
 * palette, canvas, stencil thumbnails and SVG export draw the same paths.
 *
 * Every shape gives a label area inside its visible outline that only gets
 * taller as the node does, so label fitting can always grow the node to fit.
 */

interface Spec {
  id: string
  name: string
  category: ShapeCategory
  description: string
  keywords: readonly string[]
  defaultSize: Size
  minSize: Size
  keepAspect?: boolean
  defaultLabel: string
  /** Filled and stroked paths. */
  body: (w: number, h: number) => string[]
  /** Stroke-only lines drawn over the body. */
  detail?: (w: number, h: number) => string[]
  /** Where the label goes, inside the visible outline. */
  label: (w: number, h: number) => Box
  outline: (w: number, h: number) => Point[]
  /** Defaults to the bounding box's side midpoints, for shapes whose outline passes through them. */
  anchor?: (w: number, h: number, side: Side) => Point
  /** Only sides that are straight from one corner of the box to the other. */
  spreadSides: readonly Side[]
}

function shape({ body, detail, label, outline, anchor, keepAspect = false, ...spec }: Spec): ShapeDefinition {
  const geometry = ({ width: w, height: h }: Size): ShapeGeometry => ({ body: body(w, h), detail: detail?.(w, h) ?? [], extent: { x: 0, y: 0, width: w, height: h } })
  return {
    ...spec,
    keepAspect,
    icon: outlineIcon(geometry, spec.defaultSize),
    defaultStyle: {},
    geometry,
    label: ({ width: w, height: h }) => ({ box: label(w, h), fit: 'contain', align: 'center' }),
    outline: ({ width: w, height: h }) => outline(w, h),
    sides: SIDES,
    anchor: ({ width: w, height: h }, side) => (anchor ? anchor(w, h, side) : boxSidePoint(w, h, side)),
  }
}

/** A straight-edged shape: one list of points draws it and is its outline. */
const poly = (points: (w: number, h: number) => Point[]) => ({ body: (w: number, h: number) => [polygon(points(w, h))], outline: points })

const whole = (w: number, h: number): Box => ({ x: 0, y: 0, width: w, height: h })
const rect = (w: number, h: number) => `M0 0H${n(w)}V${n(h)}H0Z`

/* ---------- Basic ---------- */

const square = shape({
  id: 'square',
  name: 'Square',
  category: 'basic',
  description: 'a box with four equal sides that stays square when resized, for a tile, cell or grid item',
  keywords: ['tile', 'cell', 'grid item', 'equal sides'],
  defaultSize: { width: 100, height: 100 },
  minSize: { width: 32, height: 32 },
  keepAspect: true,
  defaultLabel: 'Square',
  body: (w, h) => [rect(w, h)],
  label: whole,
  outline: rectOutline,
  spreadSides: SIDES,
})

const circle = shape({
  id: 'circle',
  name: 'Circle',
  category: 'basic',
  description: 'a perfectly round marker that stays round when resized, for a state, junction or numbered point',
  keywords: ['round', 'dot', 'state', 'junction', 'marker'],
  defaultSize: { width: 120, height: 120 },
  minSize: { width: 40, height: 40 },
  keepAspect: true,
  defaultLabel: 'Circle',
  body: (w, h) => {
    const [rx, ry] = [n(w / 2), n(h / 2)]
    return [`M0 ${ry}A${rx} ${ry} 0 1 1 ${n(w)} ${ry}A${rx} ${ry} 0 1 1 0 ${ry}Z`]
  },
  // The square inscribed in the circle: 1/sqrt(2) of each axis.
  label: (w, h) => {
    const k = Math.SQRT1_2
    return { x: (w * (1 - k)) / 2, y: (h * (1 - k)) / 2, width: w * k, height: h * k }
  },
  outline: (w, h) => sampleEllipse(w / 2, h / 2, w / 2, h / 2),
  spreadSides: [],
})

/** Share of a triangle's height given to the label, measured up from the base. */
const TRIANGLE_LABEL = 0.4

const triangle = shape({
  id: 'triangle',
  name: 'Triangle',
  category: 'basic',
  description: 'a three-sided shape pointing up, for a warning, a hierarchy level or a pyramid tier',
  keywords: ['warning', 'pyramid', 'tier', 'hazard', 'delta'],
  defaultSize: { width: 160, height: 140 },
  minSize: { width: 60, height: 52 },
  defaultLabel: 'Triangle',
  ...poly((w, h) => [
    { x: w / 2, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ]),
  // Lower middle: a band on the base, as wide as the triangle is where the band starts.
  label: (w, h) => ({ x: (w * TRIANGLE_LABEL) / 2, y: h * (1 - TRIANGLE_LABEL), width: w * (1 - TRIANGLE_LABEL), height: h * TRIANGLE_LABEL }),
  // Apex on top; left and right on the slanted sides at mid-height (the box's side midpoints are empty).
  anchor: (w, h, side) => (side === 'left' ? { x: w / 4, y: h / 2 } : side === 'right' ? { x: (3 * w) / 4, y: h / 2 } : boxSidePoint(w, h, side)),
  spreadSides: ['bottom'],
})

const trapezoidInset = (w: number, h: number) => Math.min(w * 0.2, h * 0.6)

const trapezoid = shape({
  id: 'trapezoid',
  name: 'Trapezoid',
  category: 'basic',
  description: 'a four-sided shape wider at the base, for a manual operation, a funnel stage or a layer',
  keywords: ['manual operation', 'funnel', 'layer', 'tapered'],
  defaultSize: { width: 160, height: 80 },
  minSize: { width: 60, height: 32 },
  defaultLabel: 'Trapezoid',
  ...poly((w, h) => {
    const i = trapezoidInset(w, h)
    return [
      { x: i, y: 0 },
      { x: w - i, y: 0 },
      { x: w, y: h },
      { x: 0, y: h },
    ]
  }),
  // As wide as the narrow top, full height.
  label: (w, h) => {
    const i = trapezoidInset(w, h)
    return { x: i, y: 0, width: w - 2 * i, height: h }
  },
  anchor: (w, h, side) => {
    const i = trapezoidInset(w, h)
    if (side === 'left') return { x: i / 2, y: h / 2 }
    if (side === 'right') return { x: w - i / 2, y: h / 2 }
    return boxSidePoint(w, h, side)
  },
  spreadSides: ['bottom'],
})

const cubeDepth = (w: number, h: number) => Math.min(Math.min(w, h) * 0.2, 24)

function cubePoints(w: number, h: number): Point[] {
  const d = cubeDepth(w, h)
  return [
    { x: 0, y: d },
    { x: d, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h - d },
    { x: w - d, y: h },
    { x: 0, y: h },
  ]
}

const cube = shape({
  id: 'cube',
  name: 'Cube',
  category: 'basic',
  description: 'a three-dimensional box, for a physical device, a package or a deployable unit',
  keywords: ['3d', 'box 3d', 'package', 'device', 'appliance'],
  defaultSize: { width: 140, height: 120 },
  minSize: { width: 48, height: 48 },
  defaultLabel: 'Cube',
  ...poly(cubePoints),
  // The front face's top and right edges, and the edge where the top meets the side.
  detail: (w, h) => {
    const d = cubeDepth(w, h)
    return [`M0 ${n(d)}H${n(w - d)}V${n(h)}`, `M${n(w - d)} ${n(d)}L${n(w)} 0`]
  },
  // The front face.
  label: (w, h) => {
    const d = cubeDepth(w, h)
    return { x: 0, y: d, width: w - d, height: h - d }
  },
  // Every side midpoint of the box lies on the cube's outer edge (top face, side face, front face).
  spreadSides: [],
})

/* ---------- Process ---------- */

const barOf = (w: number) => Math.min(w * 0.1, 16)

const predefinedProcess = shape({
  id: 'predefined-process',
  name: 'Predefined process',
  category: 'process',
  description: 'a named subroutine or process defined elsewhere, shown with double side bars',
  keywords: ['subroutine', 'subprocess', 'predefined', 'function call', 'procedure'],
  defaultSize: { width: 160, height: 80 },
  minSize: { width: 60, height: 32 },
  defaultLabel: 'Subroutine',
  body: (w, h) => [rect(w, h)],
  detail: (w, h) => {
    const b = barOf(w)
    return [`M${n(b)} 0V${n(h)}`, `M${n(w - b)} 0V${n(h)}`]
  },
  label: (w, h) => {
    const b = barOf(w)
    return { x: b, y: 0, width: w - 2 * b, height: h }
  },
  outline: rectOutline,
  spreadSides: SIDES,
})

const marginOf = (w: number, h: number) => Math.min(Math.min(w, h) * 0.15, 16)

const internalStorage = shape({
  id: 'internal-storage',
  name: 'Internal storage',
  category: 'process',
  description: 'data held in memory inside a program, with ruled top and left margins',
  keywords: ['memory', 'ram', 'variable', 'internal'],
  defaultSize: { width: 160, height: 80 },
  minSize: { width: 60, height: 40 },
  defaultLabel: 'Memory',
  body: (w, h) => [rect(w, h)],
  detail: (w, h) => {
    const m = marginOf(w, h)
    return [`M${n(m)} 0V${n(h)}`, `M0 ${n(m)}H${n(w)}`]
  },
  label: (w, h) => {
    const m = marginOf(w, h)
    return { x: m, y: m, width: w - m, height: h - m }
  },
  outline: rectOutline,
  spreadSides: SIDES,
})

/** Horizontal radius of a rounded end: a half circle when there's room, flatter when the shape is tall. */
const domeOf = (w: number, h: number) => Math.min(h / 2, w * 0.35)

/** The right half of an ellipse, top to bottom, ending at (cx, h). */
const rightDome = (cx: number, rx: number, h: number) =>
  sampleEllipse(cx, h / 2, rx, h / 2, 48)
    .filter((p) => p.x >= cx - 0.01)
    .sort((a, b) => a.y - b.y)

const delay = shape({
  id: 'delay',
  name: 'Delay',
  category: 'process',
  description: 'a wait or hold before the flow continues, flat on the left and rounded on the right',
  keywords: ['wait', 'hold', 'pause', 'timeout', 'sleep'],
  defaultSize: { width: 140, height: 80 },
  minSize: { width: 48, height: 32 },
  defaultLabel: 'Wait',
  body: (w, h) => {
    const rx = domeOf(w, h)
    return [`M0 0H${n(w - rx)}A${n(rx)} ${n(h / 2)} 0 0 1 ${n(w - rx)} ${n(h)}H0Z`]
  },
  // The square part, clear of the rounded end.
  label: (w, h) => ({ x: 0, y: 0, width: w - domeOf(w, h), height: h }),
  outline: (w, h) => [{ x: 0, y: 0 }, ...rightDome(w - domeOf(w, h), domeOf(w, h), h), { x: 0, y: h }],
  spreadSides: ['left'],
})

const displayPoint = (w: number, h: number) => Math.min(w * 0.15, h / 2)

const display = shape({
  id: 'display',
  name: 'Display',
  category: 'process',
  description: 'information shown on a screen or monitor, pointed on the left and rounded on the right',
  keywords: ['screen', 'monitor', 'show', 'readout'],
  defaultSize: { width: 160, height: 80 },
  minSize: { width: 60, height: 32 },
  defaultLabel: 'Display',
  body: (w, h) => {
    const [p, rx] = [displayPoint(w, h), domeOf(w, h)]
    return [`M${n(p)} 0H${n(w - rx)}A${n(rx)} ${n(h / 2)} 0 0 1 ${n(w - rx)} ${n(h)}H${n(p)}L0 ${n(h / 2)}Z`]
  },
  label: (w, h) => {
    const p = displayPoint(w, h)
    return { x: p, y: 0, width: w - p - domeOf(w, h), height: h }
  },
  outline: (w, h) => {
    const p = displayPoint(w, h)
    return [{ x: p, y: 0 }, ...rightDome(w - domeOf(w, h), domeOf(w, h), h), { x: p, y: h }, { x: 0, y: h / 2 }]
  },
  spreadSides: [],
})

const tapeWave = (h: number) => Math.min(h * 0.12, 14)

/** Tape's four curves, as [start, control, control, end], top left to right then bottom right to left. */
function tapeCurves(w: number, h: number): [Point, Point, Point, Point][] {
  const a = tapeWave(h)
  const pt = (x: number, y: number): Point => ({ x, y })
  return [
    [pt(0, a), pt(w * 0.17, 0), pt(w * 0.33, 0), pt(w / 2, a)],
    [pt(w / 2, a), pt(w * 0.67, 2 * a), pt(w * 0.83, 2 * a), pt(w, a)],
    [pt(w, h - a), pt(w * 0.83, h), pt(w * 0.67, h), pt(w / 2, h - a)],
    [pt(w / 2, h - a), pt(w * 0.33, h - 2 * a), pt(w * 0.17, h - 2 * a), pt(0, h - a)],
  ]
}

const tape = shape({
  id: 'tape',
  name: 'Tape',
  category: 'process',
  description: 'data on sequential storage such as a tape or an archive, with wavy top and bottom edges',
  keywords: ['magnetic tape', 'archive', 'sequential', 'backup'],
  defaultSize: { width: 160, height: 90 },
  minSize: { width: 60, height: 40 },
  defaultLabel: 'Tape',
  // Control points stay inside the box, so the curves do too.
  body: (w, h) => {
    const [t1, t2, b1, b2] = tapeCurves(w, h)
    const c = ([, p1, p2, p3]: [Point, Point, Point, Point]) => `C${[p1, p2, p3].map((p) => `${n(p.x)} ${n(p.y)}`).join(' ')}`
    return [`M0 ${n(t1![0].y)}${c(t1!)}${c(t2!)}V${n(b1![0].y)}${c(b1!)}${c(b2!)}Z`]
  },
  // Between the waves.
  label: (w, h) => ({ x: 0, y: 2 * tapeWave(h), width: w, height: h - 4 * tapeWave(h) }),
  outline: (w, h) => {
    const curves = tapeCurves(w, h)
    return curves.flatMap(([p0, p1, p2, p3], i) => [...(i % 2 === 0 ? [p0] : []), ...sampleCubic(p0, p1, p2, p3)])
  },
  // Top and bottom dock on the waves, where they cross the middle.
  anchor: (w, h, side) => {
    const a = tapeWave(h)
    if (side === 'top') return { x: w / 2, y: a }
    if (side === 'bottom') return { x: w / 2, y: h - a }
    return boxSidePoint(w, h, side)
  },
  // The straight ends stop short of the corners, where the waves start.
  spreadSides: [],
})

const cutOf = (w: number, h: number) => Math.min(Math.min(w, h) * 0.25, 20)

const card = shape({
  id: 'card',
  name: 'Card',
  category: 'process',
  description: 'a punched card or record, a rectangle with its top left corner cut off',
  keywords: ['punched card', 'record', 'index card', 'cut corner'],
  defaultSize: { width: 160, height: 90 },
  minSize: { width: 48, height: 40 },
  defaultLabel: 'Card',
  ...poly((w, h) => {
    const c = cutOf(w, h)
    return [
      { x: c, y: 0 },
      { x: w, y: 0 },
      { x: w, y: h },
      { x: 0, y: h },
      { x: 0, y: c },
    ]
  }),
  // Inset by half the cut on every side: its top left corner just touches the cut edge.
  label: (w, h) => {
    const c = cutOf(w, h)
    return { x: c / 2, y: c / 2, width: w - c, height: h - c }
  },
  spreadSides: ['right', 'bottom'],
})

const stepPoint = (w: number, h: number) => Math.min(w * 0.2, h / 2)

const step = shape({
  id: 'step',
  name: 'Step',
  category: 'process',
  description: 'one stage in a sequence of stages, a chevron pointing to the next',
  keywords: ['chevron', 'stage', 'phase', 'milestone', 'roadmap'],
  defaultSize: { width: 160, height: 80 },
  minSize: { width: 60, height: 32 },
  defaultLabel: 'Stage',
  ...poly((w, h) => {
    const p = stepPoint(w, h)
    return [
      { x: 0, y: 0 },
      { x: w - p, y: 0 },
      { x: w, y: h / 2 },
      { x: w - p, y: h },
      { x: 0, y: h },
      { x: p, y: h / 2 },
    ]
  }),
  // Clear of the notch on the left and the point on the right.
  label: (w, h) => {
    const p = stepPoint(w, h)
    return { x: p, y: 0, width: w - 2 * p, height: h }
  },
  // Left docks in the notch: the box's left midpoint is empty.
  anchor: (w, h, side) => (side === 'left' ? { x: stepPoint(w, h), y: h / 2 } : boxSidePoint(w, h, side)),
  spreadSides: [],
})

/* ---------- Arrows ---------- */

/** Shaft thickness as a share of the height (the head is the full height). */
const SHAFT = 0.5
const shaftEdge = (h: number) => (h * (1 - SHAFT)) / 2
const headOf = (w: number, h: number, share: number) => Math.min(w * share, h * 0.75)

function blockArrowPoints(w: number, h: number): Point[] {
  const [t, hd] = [shaftEdge(h), headOf(w, h, 0.35)]
  return [
    { x: 0, y: t },
    { x: w - hd, y: t },
    { x: w - hd, y: 0 },
    { x: w, y: h / 2 },
    { x: w - hd, y: h },
    { x: w - hd, y: h - t },
    { x: 0, y: h - t },
  ]
}

const blockArrow = shape({
  id: 'block-arrow',
  name: 'Block arrow',
  category: 'arrows',
  description: 'a thick arrow pointing one way, for a direction, a hand-off or a next action',
  keywords: ['right arrow', 'direction', 'forward', 'hand-off', 'next'],
  defaultSize: { width: 160, height: 80 },
  minSize: { width: 60, height: 32 },
  defaultLabel: 'Next',
  ...poly(blockArrowPoints),
  // The shaft, running on into the head as far as the head is still taller than the shaft.
  label: (w, h) => {
    const [t, hd] = [shaftEdge(h), headOf(w, h, 0.35)]
    return { x: 0, y: t, width: w - hd / 2, height: h - 2 * t }
  },
  // Top and bottom dock on the shaft, halfway along it.
  anchor: (w, h, side) => {
    const [t, hd] = [shaftEdge(h), headOf(w, h, 0.35)]
    if (side === 'top') return { x: (w - hd) / 2, y: t }
    if (side === 'bottom') return { x: (w - hd) / 2, y: h - t }
    return boxSidePoint(w, h, side)
  },
  spreadSides: [],
})

function doubleArrowPoints(w: number, h: number): Point[] {
  const [t, hd] = [shaftEdge(h), headOf(w, h, 0.25)]
  return [
    { x: 0, y: h / 2 },
    { x: hd, y: 0 },
    { x: hd, y: t },
    { x: w - hd, y: t },
    { x: w - hd, y: 0 },
    { x: w, y: h / 2 },
    { x: w - hd, y: h },
    { x: w - hd, y: h - t },
    { x: hd, y: h - t },
    { x: hd, y: h },
  ]
}

const doubleArrow = shape({
  id: 'double-arrow',
  name: 'Double arrow',
  category: 'arrows',
  description: 'a thick arrow pointing both ways, for an exchange, a sync or a two-way relationship',
  keywords: ['two-way', 'bidirectional', 'exchange', 'sync', 'both ways'],
  defaultSize: { width: 180, height: 80 },
  minSize: { width: 80, height: 32 },
  defaultLabel: 'Sync',
  ...poly(doubleArrowPoints),
  label: (w, h) => {
    const [t, hd] = [shaftEdge(h), headOf(w, h, 0.25)]
    return { x: hd / 2, y: t, width: w - hd, height: h - 2 * t }
  },
  anchor: (w, h, side) => {
    const t = shaftEdge(h)
    if (side === 'top') return { x: w / 2, y: t }
    if (side === 'bottom') return { x: w / 2, y: h - t }
    return boxSidePoint(w, h, side)
  },
  spreadSides: [],
})

export const BASIC_4: readonly ShapeDefinition[] = [square, circle, triangle, trapezoid, cube]
export const PROCESS_4: readonly ShapeDefinition[] = [predefinedProcess, internalStorage, delay, display, tape, card, step]
export const ARROWS: readonly ShapeDefinition[] = [blockArrow, doubleArrow]
