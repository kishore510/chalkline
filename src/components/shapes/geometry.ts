import type { NodeType, Size } from '@/schema/diagram'

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Outline of a node type in its own coordinate space (0,0 to width,height).
 * `body` paths are filled and stroked, `detail` paths are stroke only, and
 * `extent` bounds what is drawn. Label placement lives in labelLayout().
 */
export interface ShapeGeometry {
  body: string[]
  detail: string[]
  extent: Box
}

/**
 * Where the label goes. `contain` labels wrap inside the box; `free` labels
 * are centred on the box and may spread wider than the node.
 */
export interface LabelLayout {
  box: Box
  fit: 'contain' | 'free'
  /** Vertical alignment inside the box. */
  align: 'center' | 'start'
}

const n = (value: number) => Math.round(value * 100) / 100

// Corner radius for the rounded box, capped so small boxes still look right.
const ROUNDED_RADIUS = 12
/** Share of the actor's height used by the figure; the label sits below it. */
export const ACTOR_FIGURE_RATIO = 0.65

function rectPath(w: number, h: number): string {
  return `M0 0H${n(w)}V${n(h)}H0Z`
}

function roundedPath(w: number, h: number): string {
  const r = n(Math.min(ROUNDED_RADIUS, w / 4, h / 4))
  const [W, H] = [n(w), n(h)]
  return (
    `M${r} 0H${n(w - r)}A${r} ${r} 0 0 1 ${W} ${r}V${n(h - r)}A${r} ${r} 0 0 1 ${n(w - r)} ${H}` +
    `H${r}A${r} ${r} 0 0 1 0 ${n(h - r)}V${r}A${r} ${r} 0 0 1 ${r} 0Z`
  )
}

const cylinderRy = (w: number, h: number) => n(Math.min(h * 0.12, w * 0.2))

function database(w: number, h: number): ShapeGeometry {
  const rx = n(w / 2)
  const ry = cylinderRy(w, h)
  const [W, H] = [n(w), n(h)]
  return {
    body: [`M0 ${ry}A${rx} ${ry} 0 0 1 ${W} ${ry}V${n(H - ry)}A${rx} ${ry} 0 0 1 0 ${n(H - ry)}Z`],
    detail: [`M0 ${ry}A${rx} ${ry} 0 0 0 ${W} ${ry}`],
    extent: { x: 0, y: 0, width: w, height: h },
  }
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

function cloud(w: number, h: number): ShapeGeometry {
  const pt = ([x, y]: [number, number]) => `${n(x * w)} ${n(y * h)}`
  const [start, ...curves] = CLOUD
  const d = `M${pt(start![0]!)}` + curves.map((c) => `C${c.map(pt).join(' ')}`).join('') + 'Z'
  return { body: [d], detail: [], extent: { x: 0, y: 0, width: w, height: h } }
}

function actor(w: number, h: number): ShapeGeometry {
  const fh = h * ACTOR_FIGURE_RATIO
  // Keep the figure's proportions however wide the node is.
  const fw = Math.min(w, fh * 0.62)
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
    extent: { x: (w - fw) / 2, y: 0, width: fw, height: fh },
  }
}

export function shapeGeometry(type: NodeType, { width: w, height: h }: Size): ShapeGeometry {
  const full: Box = { x: 0, y: 0, width: w, height: h }
  switch (type) {
    case 'rectangle':
      return { body: [rectPath(w, h)], detail: [], extent: full }
    case 'rounded':
      return { body: [roundedPath(w, h)], detail: [], extent: full }
    case 'database':
      return database(w, h)
    case 'cloud':
      return cloud(w, h)
    case 'actor':
      return actor(w, h)
    case 'text':
      return { body: [], detail: [], extent: full }
  }
}

export function labelLayout(type: NodeType, { width: w, height: h }: Size): LabelLayout {
  switch (type) {
    case 'rectangle':
    case 'rounded':
      return { box: { x: 0, y: 0, width: w, height: h }, fit: 'contain', align: 'center' }
    case 'database': {
      const ry = cylinderRy(w, h)
      return { box: { x: 0, y: 2 * ry, width: w, height: Math.max(0, h - 3 * ry) }, fit: 'contain', align: 'center' }
    }
    case 'cloud':
      return { box: { x: w * 0.14, y: h * 0.3, width: w * 0.72, height: h * 0.6 }, fit: 'contain', align: 'center' }
    case 'actor': {
      const fh = h * ACTOR_FIGURE_RATIO
      return { box: { x: 0, y: fh, width: w, height: h - fh }, fit: 'free', align: 'start' }
    }
    case 'text':
      return { box: { x: 0, y: 0, width: w, height: h }, fit: 'free', align: 'center' }
  }
}

/** Height limit when growing a node to fit its label (matches the schema's practical range). */
const MAX_GROW_HEIGHT = 4000

/**
 * Smallest node height at which the label zone is at least `contentHeight`
 * tall, for a node of the given width. Label zones grow with height, so a
 * binary search is exact enough; the result is rounded up to whole pixels.
 */
export function minHeightForLabel(type: NodeType, width: number, contentHeight: number): number {
  const fits = (h: number) => labelLayout(type, { width, height: h }).box.height >= contentHeight
  if (fits(1)) return 1
  let lo = 1
  let hi = MAX_GROW_HEIGHT
  if (!fits(hi)) return hi
  while (hi - lo > 0.5) {
    const mid = (lo + hi) / 2
    if (fits(mid)) hi = mid
    else lo = mid
  }
  // Smallest whole pixel height that fits.
  let h = Math.ceil(lo)
  while (!fits(h)) h++
  return h
}
