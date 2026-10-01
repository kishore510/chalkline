import { r2 as n } from './outline'
import type { Point } from './types'

/* SVG path builders shared by the shape definitions. */

export const circle = (cx: number, cy: number, r: number) => `M${n(cx - r)} ${n(cy)}A${n(r)} ${n(r)} 0 1 1 ${n(cx + r)} ${n(cy)}A${n(r)} ${n(r)} 0 1 1 ${n(cx - r)} ${n(cy)}Z`

export const roundedRect = (x: number, y: number, w: number, h: number, radius: number) => {
  const r = Math.min(radius, w / 2, h / 2)
  return (
    `M${n(x + r)} ${n(y)}H${n(x + w - r)}A${n(r)} ${n(r)} 0 0 1 ${n(x + w)} ${n(y + r)}V${n(y + h - r)}A${n(r)} ${n(r)} 0 0 1 ${n(x + w - r)} ${n(y + h)}` +
    `H${n(x + r)}A${n(r)} ${n(r)} 0 0 1 ${n(x)} ${n(y + h - r)}V${n(y + r)}A${n(r)} ${n(r)} 0 0 1 ${n(x + r)} ${n(y)}Z`
  )
}

export const polygon = (points: Point[]) => `M${points.map((p) => `${n(p.x)} ${n(p.y)}`).join('L')}Z`

export const cylinderRy = (w: number, h: number) => n(Math.min(h * 0.12, w * 0.2))

export const hexInset = (w: number, h: number) => Math.min(w / 4, h / 2)

export function hexagonPoints(w: number, h: number): Point[] {
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
