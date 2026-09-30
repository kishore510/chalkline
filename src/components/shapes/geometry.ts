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
 * `label` is where the label text is laid out.
 */
export interface ShapeGeometry {
  body: string[]
  detail: string[]
  label: Box
}

const n = (value: number) => Math.round(value * 100) / 100

// Corner radius for the rounded box, capped so small boxes still look right.
const ROUNDED_RADIUS = 12
// Height of the label band under the actor figure.
const ACTOR_LABEL_BAND = 24

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

function database(w: number, h: number): ShapeGeometry {
  const rx = n(w / 2)
  const ry = n(Math.min(h * 0.12, w * 0.2))
  const [W, H] = [n(w), n(h)]
  return {
    body: [`M0 ${ry}A${rx} ${ry} 0 0 1 ${W} ${ry}V${n(h - ry)}A${rx} ${ry} 0 0 1 0 ${n(h - ry)}Z`],
    detail: [`M0 ${ry}A${rx} ${ry} 0 0 0 ${W} ${ry}`],
    label: { x: 0, y: 2 * ry, width: w, height: Math.max(0, H - 3 * ry) },
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
  return {
    body: [d],
    detail: [],
    label: { x: w * 0.14, y: h * 0.3, width: w * 0.72, height: h * 0.6 },
  }
}

function actor(w: number, h: number): ShapeGeometry {
  const band = Math.min(ACTOR_LABEL_BAND, h * 0.3)
  const fh = h - band
  const cx = n(w / 2)
  const r = n(Math.min(w * 0.22, fh * 0.14))
  const neck = n(2 * r)
  const hip = n(fh * 0.64)
  const shoulder = n(2 * r + (fh - 2 * r) * 0.18)
  return {
    body: [`M${n(cx - r)} ${r}A${r} ${r} 0 1 1 ${n(cx + r)} ${r}A${r} ${r} 0 1 1 ${n(cx - r)} ${r}Z`],
    detail: [
      `M${cx} ${neck}V${hip}`,
      `M${n(w * 0.1)} ${shoulder}H${n(w * 0.9)}`,
      `M${n(w * 0.16)} ${n(fh)}L${cx} ${hip}L${n(w * 0.84)} ${n(fh)}`,
    ],
    label: { x: 0, y: fh, width: w, height: band },
  }
}

export function shapeGeometry(type: NodeType, { width: w, height: h }: Size): ShapeGeometry {
  const full: Box = { x: 0, y: 0, width: w, height: h }
  switch (type) {
    case 'rectangle':
      return { body: [rectPath(w, h)], detail: [], label: full }
    case 'rounded':
      return { body: [roundedPath(w, h)], detail: [], label: full }
    case 'database':
      return database(w, h)
    case 'cloud':
      return cloud(w, h)
    case 'actor':
      return actor(w, h)
    case 'text':
      return { body: [], detail: [], label: full }
  }
}
