import type { Diagram } from '@/schema/diagram'
import { getShape, isKnownShape } from '@/shapes/registry'
import type { RenderModel } from './renderModel'

/*
 * Keyboard navigation of the canvas. The canvas is one Tab stop; from it,
 * Tab and Shift+Tab move through the drawn shapes and group frames in reading
 * order (rows top to bottom, each left to right), then the connectors. Past
 * either end, focus leaves the canvas as usual: it never gets trapped.
 * Shapes on hidden layers and inside collapsed groups aren't drawn, so they
 * aren't stops. Pure: the canvas asks for the order when a key is pressed.
 */

export type FocusKind = 'shape' | 'group' | 'connector'

export interface FocusStop {
  id: string
  kind: FocusKind
}

/** Height of the band a row is read in: things whose reading point falls within it share the row. */
const ROW = 40

type Model = Pick<RenderModel, 'groups' | 'hiddenNodes' | 'edges'>

interface Placed extends FocusStop {
  x: number
  y: number
}

/** Rows top to bottom (an item joins the row whose first item's band it falls in), each left to right. */
function readingOrder<T extends { x: number; y: number }>(items: T[]): T[] {
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x)
  const rows: T[][] = []
  for (const item of sorted) {
    const row = rows.at(-1)
    if (row && item.y - row[0]!.y < ROW) row.push(item)
    else rows.push([item])
  }
  return rows.flatMap((row) => row.sort((a, b) => a.x - b.x))
}

export function focusOrder(d: Diagram, model: Model): FocusStop[] {
  const places: Placed[] = []
  // Shapes are read at their middle; group frames at their header.
  for (const n of d.nodes) {
    if (model.hiddenNodes.has(n.id)) continue
    places.push({ id: n.id, kind: 'shape', x: n.position.x, y: n.position.y + Math.min(n.size.height, ROW * 2) / 2 })
  }
  for (const v of model.groups) places.push({ id: v.group.id, kind: 'group', x: v.box.x, y: v.box.y })
  const at = new Map(places.map((p) => [p.id, p]))
  const connectors = model.edges.flatMap((e) => {
    const s = at.get(e.source)
    const t = at.get(e.target)
    return s && t ? [{ id: e.id, kind: 'connector' as const, x: (s.x + t.x) / 2, y: (s.y + t.y) / 2 }] : []
  })
  return [...readingOrder(places), ...readingOrder(connectors)].map(({ id, kind }) => ({ id, kind }))
}

/**
 * Where Tab (or Shift+Tab with `back`) goes from `current`: the next stop, or
 * null to let focus leave the canvas. From the canvas itself (current null or
 * not a stop), Tab enters at the first stop; Shift+Tab leaves.
 */
export function nextFocus(order: readonly FocusStop[], current: string | null, back: boolean): FocusStop | null {
  const index = current === null ? -1 : order.findIndex((s) => s.id === current)
  if (index === -1) return back ? null : (order[0] ?? null)
  return order[index + (back ? -1 : 1)] ?? null
}

/** The accessible name of a shape: its label and what it is, plus locked. */
export function shapeName(label: string, type: string, locked: boolean): string {
  const kind = isKnownShape(type) ? getShape(type).name.toLowerCase() : 'unknown shape'
  return `${label.trim() || 'Untitled'}, ${kind}${locked ? ', locked' : ''}`
}

/** The accessible name of a connector: where it runs, and its label. */
export function connectorName(source: string, target: string, label: string): string {
  const text = label.trim()
  return `Connector from ${source.trim() || 'Untitled'} to ${target.trim() || 'Untitled'}${text ? `: ${text}` : ''}`
}
