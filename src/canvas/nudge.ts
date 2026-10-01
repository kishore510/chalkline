import type { Diagram, Position } from '@/schema/diagram'
import { ancestors, groupById, isGroupFixed, isNodeLocked } from '@/store/groups'
import { isNodeHidden } from '@/store/layers'
import { snapDrag, type SnapContext, type Targets } from './guideTargets'
import type { GuideResult } from './guides'
import type { RenderModel } from './renderModel'

/*
 * Arrow-key nudges, snapped by the same rules as a drag (snapDrag): the
 * nudged position is treated as a drag to that spot. Pure; the canvas
 * supplies the targets and the snap context, as it does for a drag.
 */

type Model = Pick<RenderModel, 'groups' | 'hiddenNodes'>

/** Step in canvas units. With the grid on, a nudge moves a grid square (Shift: five); otherwise 1 (Shift: 10). */
export function nudgeStep(grid: number, far: boolean): number {
  if (grid > 0) return far ? grid * 5 : grid
  return far ? 10 : 1
}

/**
 * The selected items a nudge moves, as dragging would: drawn, unlocked shapes
 * and containers (not lanes, which move with their pool). Items inside a
 * moving container are left out; they move with it.
 */
export function nudgeItems(d: Diagram, model: Model, ids: Iterable<string>): string[] {
  const drawnGroups = new Set(model.groups.map((v) => v.group.id))
  const groups = new Set<string>()
  const nodes: string[] = []
  for (const id of new Set(ids)) {
    const group = groupById(d, id)
    if (group) {
      if (group.kind === 'container' && drawnGroups.has(id) && !isGroupFixed(d, group)) groups.add(id)
      continue
    }
    const node = d.nodes.find((n) => n.id === id)
    if (node && !model.hiddenNodes.has(id) && !isNodeHidden(d, node) && !isNodeLocked(d, node)) nodes.push(id)
  }
  const carried = (groupId: string | undefined) => {
    const group = groupById(d, groupId)
    return Boolean(group && (groups.has(group.id) || ancestors(d, group).some((a) => groups.has(a.id))))
  }
  const topGroups = [...groups].filter((id) => !ancestors(d, groupById(d, id)).some((a) => groups.has(a.id)))
  const topNodes = nodes.filter((id) => !carried(d.nodes.find((n) => n.id === id)?.groupId))
  return [...topGroups, ...topNodes]
}

const positionOf = (d: Diagram, id: string): Position | undefined => (groupById(d, id) ?? d.nodes.find((n) => n.id === id))?.position

export interface NudgePlan {
  /** New positions (as stored: shape and group positions) for the items that move. */
  moves: Map<string, Position>
  offset: Position
  /** Guides for the overlay, on the nudge's axis only; null when nothing snapped. */
  guides: GuideResult | null
}

/**
 * Plans a nudge of `ids` by `delta` (along one axis). The target is snapped
 * exactly as dragging there would be, on the nudge's axis; the other axis
 * stays put, so an arrow key only ever moves one way. If snapping would hold
 * the item still or pull it backwards (e.g. back onto the guide or grid line
 * it is leaving), the plain step is used instead, so a nudge always moves.
 * Null if nothing selected can move (locked, hidden, or nothing selected).
 */
export function planNudge(d: Diagram, model: Model, ids: Iterable<string>, delta: Position, targets: Targets, ctx: SnapContext): NudgePlan | null {
  const items = nudgeItems(d, model, ids)
  const [first] = items
  const from = first === undefined ? undefined : positionOf(d, first)
  if (first === undefined || !from) return null
  const proposed = new Map<string, Position>()
  for (const id of items) {
    const p = positionOf(d, id)
    if (p) proposed.set(id, { x: p.x + delta.x, y: p.y + delta.y })
  }
  const snapped = snapDrag(d, model, proposed, targets, ctx)
  const axis = delta.x !== 0 ? 'x' : 'y'
  const want = delta[axis]
  const got = (snapped.moves.get(first)?.[axis] ?? from[axis] + want) - from[axis]
  const progress = got !== 0 && Math.sign(got) === Math.sign(want)
  const step = progress ? got : want
  const offset = axis === 'x' ? { x: step, y: 0 } : { x: 0, y: step }
  const moves = new Map<string, Position>()
  for (const [id, p] of proposed) moves.set(id, { x: p.x - delta.x + offset.x, y: p.y - delta.y + offset.y })
  const guides =
    progress && snapped.guides
      ? { ...snapped.guides, lines: snapped.guides.lines.filter((l) => l.axis === axis), measures: snapped.guides.measures.filter((m) => m.axis === axis) }
      : null
  return { moves, offset, guides }
}
