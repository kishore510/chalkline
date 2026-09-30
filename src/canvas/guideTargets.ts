import type { Diagram, Position } from '@/schema/diagram'
import { getShape } from '@/shapes/registry'
import { membersOf, subtreeIds, unionBox, type Box } from '@/store/groups'
import { computeGuides, computeResizeGuides, type CentreTarget, type GuideResult, type GuideTarget, type ResizeEdges, type ResizeGuideResult } from './guides'
import type { RenderModel } from './renderModel'

/*
 * The adapter between the diagram and the guide geometry in guides.ts: which
 * boxes are targets, the moving box, and applying the snap to drag moves and
 * resizes. Pure; the canvas supplies the zoom, the view and the preferences.
 */

type Model = Pick<RenderModel, 'groups' | 'hiddenNodes'>

export interface Targets {
  targets: GuideTarget[]
  centres: CentreTarget[]
}

const intersects = (a: Box, b: Box) => a.x <= b.x + b.width && b.x <= a.x + a.width && a.y <= b.y + b.height && b.y <= a.y + a.height
const grow = (b: Box, by: number): Box => ({ x: b.x - by, y: b.y - by, width: b.width + 2 * by, height: b.height + 2 * by })

/** The moving items plus everything inside moving groups. */
export function movingSet(d: Diagram, ids: Iterable<string>): Set<string> {
  const out = new Set<string>()
  const groupIds = new Set(d.groups.map((g) => g.id))
  for (const id of ids) {
    out.add(id)
    if (!groupIds.has(id)) continue
    const sub = subtreeIds(d, id)
    for (const g of sub) out.add(g)
    for (const n of membersOf(d, sub)) out.add(n.id)
  }
  return out
}

/**
 * Guide targets for moving `ids`: drawn shapes and group frames (locked ones
 * too; items on hidden layers or in collapsed groups are not drawn, so not
 * targets), without the moving items and their contents. `view` (canvas
 * coordinates) plus `margin` limits targets to what's on or near the screen.
 * Centres: the diagram's (all drawn items except the moving ones) and, when
 * every moving item sits in the same group or lane, that container's.
 */
export function guideTargets(d: Diagram, model: Model, ids: Iterable<string>, view?: Box | null, margin = 0): Targets {
  const direct = [...ids]
  const moving = movingSet(d, direct)
  const all: GuideTarget[] = []
  for (const n of d.nodes) {
    if (!moving.has(n.id) && !model.hiddenNodes.has(n.id)) all.push({ id: n.id, box: { ...n.position, ...n.size } })
  }
  for (const v of model.groups) if (!moving.has(v.group.id)) all.push({ id: v.group.id, box: v.box })

  const centres: CentreTarget[] = []
  const whole = unionBox(all.map((t) => t.box))
  if (whole) centres.push({ kind: 'diagram', box: whole })

  // The container of the items being moved directly (not those carried along inside a moving group).
  const parents = new Set<string | undefined>()
  for (const id of direct) {
    const group = d.groups.find((g) => g.id === id)
    const parent = group ? group.parentId : d.nodes.find((n) => n.id === id)?.groupId
    if (parent === undefined || !moving.has(parent)) parents.add(parent)
  }
  const [parent] = parents
  const frame = parents.size === 1 && parent ? model.groups.find((v) => v.group.id === parent) : undefined
  if (frame) centres.push({ kind: 'container', id: frame.group.id, box: frame.box })

  return nearView({ targets: all, centres }, view, margin)
}

/** Only the targets on or near the screen (`view` in canvas coordinates, `margin` in canvas units). */
export function nearView(t: Targets, view?: Box | null, margin = 0): Targets {
  if (!view) return t
  const area = grow(view, margin)
  return { targets: t.targets.filter((x) => intersects(x.box, area)), centres: t.centres }
}

/** The drawn box of a shape or group frame, if it is drawn. */
function boxOf(d: Diagram, model: Model, id: string): Box | null {
  const node = d.nodes.find((n) => n.id === id)
  if (node) return { ...node.position, ...node.size }
  return model.groups.find((v) => v.group.id === id)?.box ?? null
}

export interface SnapContext {
  zoom: number
  guides: boolean
  grid: number
  equalSpacing?: boolean
  threshold?: number
}

/**
 * Snaps a drag: `moves` are the proposed positions of the dragged items
 * (shapes and group frames). They move as one box, so every item gets the
 * same offset. The grid snaps the first item's position, as React Flow does.
 */
export function snapDrag(
  d: Diagram,
  model: Model,
  moves: ReadonlyMap<string, Position>,
  targets: Targets,
  ctx: SnapContext,
): { moves: Map<string, Position>; guides: GuideResult | null } {
  const boxes: Box[] = []
  for (const [id, to] of moves) {
    const box = boxOf(d, model, id)
    if (box) boxes.push({ ...box, x: to.x, y: to.y })
  }
  const moving = unionBox(boxes)
  const [first] = moves.values()
  if (!moving || !first) return { moves: new Map(moves), guides: null }
  const result = computeGuides(moving, targets.targets, {
    zoom: ctx.zoom,
    guides: ctx.guides,
    grid: ctx.grid,
    gridAnchor: first,
    centres: targets.centres,
    ...(ctx.equalSpacing !== undefined && { equalSpacing: ctx.equalSpacing }),
    ...(ctx.threshold !== undefined && { threshold: ctx.threshold }),
  })
  const out = new Map([...moves].map(([id, p]) => [id, { x: p.x + result.dx, y: p.y + result.dy }]))
  return { moves: out, guides: result }
}

const EPS = 1e-6

/** Which edges moved between the box at the start of a resize and now. */
export function movedEdges(start: Box, now: Box): ResizeEdges {
  return {
    left: Math.abs(now.x - start.x) > EPS,
    right: Math.abs(now.x + now.width - (start.x + start.width)) > EPS,
    top: Math.abs(now.y - start.y) > EPS,
    bottom: Math.abs(now.y + now.height - (start.y + start.height)) > EPS,
  }
}

/**
 * Snaps a resize of `id` from `start` to the proposed `box`. Shapes that keep
 * their aspect ratio aren't snapped (snapping one side would break it).
 */
export function snapResize(d: Diagram, id: string, start: Box, box: Box, targets: Targets, ctx: SnapContext): ResizeGuideResult {
  const node = d.nodes.find((n) => n.id === id)
  const shape = node ? getShape(node.type) : undefined
  if (shape?.keepAspect) return { box, snapX: null, snapY: null, lines: [], measures: [], aligned: [] }
  return computeResizeGuides(box, movedEdges(start, box), targets.targets, {
    zoom: ctx.zoom,
    guides: ctx.guides,
    grid: ctx.grid,
    ...(shape && { minSize: shape.minSize }),
    ...(ctx.threshold !== undefined && { threshold: ctx.threshold }),
  })
}
