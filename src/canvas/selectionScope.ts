import type { Diagram, Position } from '@/schema/diagram'
import { groupById, subtreeIds, type Box } from '@/store/groups'
import { nudgeItems } from './nudge'
import type { RenderModel } from './renderModel'

/*
 * Selecting groups, pools and lanes alongside shapes. React Flow only knows
 * about shapes (groups are selected through their header, see GroupNode), so
 * select-all, box-select and dragging a mixed selection are completed here.
 * Pure; the canvas and the shortcuts call these.
 */

type Model = Pick<RenderModel, 'groups' | 'hiddenNodes'>

/** Everything in the diagram: shapes, connectors, groups, pools and lanes. The store drops what's on hidden layers. */
export function selectAllIds(d: Diagram): string[] {
  return [...d.nodes.map((n) => n.id), ...d.edges.map((e) => e.id), ...d.groups.map((g) => g.id)]
}

const inside = (inner: Box, outer: Box) =>
  inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height

/**
 * Drawn groups (containers, pools, lanes) whose whole frame lies inside a
 * selection box, in canvas units. Shapes only need to touch the box; a group
 * must be fully inside, so a box drawn within a group picks its shapes, not it.
 */
export function groupsInBox(model: Pick<RenderModel, 'groups'>, box: Box): string[] {
  return model.groups.filter((v) => inside(v.box, box)).map((v) => v.group.id)
}

/** Converts React Flow's on-screen selection rectangle to a box in canvas units. */
export function screenRectToBox(rect: { x: number; y: number; width: number; height: number }, [tx, ty, zoom]: readonly [number, number, number]): Box {
  return { x: (rect.x - tx) / zoom, y: (rect.y - ty) / zoom, width: rect.width / zoom, height: rect.height / zoom }
}

const positionOf = (d: Diagram, id: string): Position | undefined => (groupById(d, id) ?? d.nodes.find((n) => n.id === id))?.position

/**
 * A drag of selected shapes also carries the selected containers and pools,
 * by the same offset, as nudging does (lanes move with their pool). Returns
 * the moves to apply: React Flow's own, plus the carried groups, minus shapes
 * inside a moving group (they move with it). Unchanged if the dragged items
 * aren't part of the selection.
 */
export function carryGroups(d: Diagram, model: Model, selection: readonly string[], moves: ReadonlyMap<string, Position>): Map<string, Position> {
  const selected = new Set(selection)
  const ref = [...moves.keys()].find((id) => selected.has(id) && positionOf(d, id))
  if (ref === undefined || !d.groups.some((g) => selected.has(g.id))) return new Map(moves)
  const from = positionOf(d, ref)!
  const to = moves.get(ref)!
  const delta = { x: to.x - from.x, y: to.y - from.y }

  const out = new Map<string, Position>()
  const carried = new Set<string>()
  for (const id of nudgeItems(d, model, [...selection, ...moves.keys()])) {
    const group = groupById(d, id)
    if (!group) continue
    out.set(id, moves.get(id) ?? { x: group.position.x + delta.x, y: group.position.y + delta.y })
    for (const sub of subtreeIds(d, id)) carried.add(sub)
  }
  for (const [id, p] of moves) {
    if (out.has(id) || carried.has(id)) continue
    const node = d.nodes.find((n) => n.id === id)
    if (node?.groupId && carried.has(node.groupId)) continue
    out.set(id, p)
  }
  return out
}
