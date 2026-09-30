import { DEFAULT_HEADER_SIZE, type Diagram, type DiagramGroup, type DiagramNode, type Orientation, type Position } from '@/schema/diagram'

/*
 * Pure operations on groups (containers, pools and lanes). Positions are
 * absolute, so moving a group means moving everything inside it too.
 * Locking is derived: a node or group inside a locked group counts as locked.
 */

/** Space kept between a group's edge and its members. */
export const GROUP_PADDING = 16
/** Thinnest a lane may be. */
export const MIN_LANE = 60
export const DEFAULT_LANE_THICKNESS: Record<Orientation, number> = { horizontal: 160, vertical: 240 }
/** Length of new lanes along their run (the pool's other dimension, before its header). */
const DEFAULT_LANE_RUN: Record<Orientation, number> = { horizontal: 720, vertical: 480 }

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

const boxOf = (item: { position: Position; size: { width: number; height: number } }): Box => ({ ...item.position, ...item.size })

export function unionBox(boxes: Box[]): Box | null {
  if (boxes.length === 0) return null
  const x = Math.min(...boxes.map((b) => b.x))
  const y = Math.min(...boxes.map((b) => b.y))
  return { x, y, width: Math.max(...boxes.map((b) => b.x + b.width)) - x, height: Math.max(...boxes.map((b) => b.y + b.height)) - y }
}

/* ---------- Hierarchy ---------- */

export const headerSize = (g: DiagramGroup) => g.headerSize ?? DEFAULT_HEADER_SIZE

export function groupById(d: Diagram, id: string | undefined): DiagramGroup | undefined {
  return id === undefined ? undefined : d.groups.find((g) => g.id === id)
}

export function childGroups(d: Diagram, id: string): DiagramGroup[] {
  return d.groups.filter((g) => g.parentId === id)
}

/** The group and every group nested inside it. */
export function subtreeIds(d: Diagram, id: string): Set<string> {
  const ids = new Set([id])
  let grew = true
  while (grew) {
    grew = false
    for (const g of d.groups) {
      if (g.parentId && ids.has(g.parentId) && !ids.has(g.id)) {
        ids.add(g.id)
        grew = true
      }
    }
  }
  return ids
}

export function membersOf(d: Diagram, groupIds: ReadonlySet<string>): DiagramNode[] {
  return d.nodes.filter((n) => n.groupId !== undefined && groupIds.has(n.groupId))
}

/** Ancestors from the parent outwards. */
export function ancestors(d: Diagram, group: DiagramGroup | undefined): DiagramGroup[] {
  const out: DiagramGroup[] = []
  const seen = new Set<string>()
  for (let g = groupById(d, group?.parentId); g && !seen.has(g.id); g = groupById(d, g.parentId)) {
    seen.add(g.id)
    out.push(g)
  }
  return out
}

export function depth(d: Diagram, group: DiagramGroup): number {
  return ancestors(d, group).length
}

/** Parents before children, keeping the existing order otherwise. */
export function parentsFirst(groups: DiagramGroup[]): DiagramGroup[] {
  const byId = new Map(groups.map((g) => [g.id, g]))
  const out: DiagramGroup[] = []
  const placed = new Set<string>()
  const place = (g: DiagramGroup, trail: Set<string>) => {
    if (placed.has(g.id) || trail.has(g.id)) return
    const parent = g.parentId ? byId.get(g.parentId) : undefined
    if (parent) place(parent, new Set([...trail, g.id]))
    placed.add(g.id)
    out.push(g)
  }
  for (const g of groups) place(g, new Set())
  return out
}

export function isGroupLocked(d: Diagram, group: DiagramGroup | undefined): boolean {
  return Boolean(group && (group.locked || ancestors(d, group).some((a) => a.locked)))
}

/** Locked itself, or inside a locked group. */
export function isNodeLocked(d: Diagram, node: DiagramNode): boolean {
  return node.locked || isGroupLocked(d, groupById(d, node.groupId))
}

/** Hidden because some enclosing group is collapsed. */
export function isGroupHidden(d: Diagram, group: DiagramGroup): boolean {
  return ancestors(d, group).some((a) => a.collapsed)
}

export function isPool(d: Diagram, group: DiagramGroup): boolean {
  return group.kind === 'container' && childGroups(d, group.id).some((g) => g.kind === 'lane')
}

/** The direction lanes run in: from the lane itself, or a pool's first lane. */
export function orientationOf(d: Diagram, group: DiagramGroup): Orientation | undefined {
  if (group.kind === 'lane') return group.orientation ?? 'horizontal'
  const lane = childGroups(d, group.id).find((g) => g.kind === 'lane')
  return lane ? (lane.orientation ?? group.orientation ?? 'horizontal') : undefined
}

/** Where the title sits: on the left for horizontal lanes and pools, otherwise on top. */
export function headerSide(d: Diagram, group: DiagramGroup): 'top' | 'left' {
  return orientationOf(d, group) === 'horizontal' ? 'left' : 'top'
}

/** The group's box without its header. */
export function bodyBox(d: Diagram, group: DiagramGroup): Box {
  const h = headerSize(group)
  const { x, y, width, height } = boxOf(group)
  return headerSide(d, group) === 'left'
    ? { x: x + h, y, width: Math.max(0, width - h), height }
    : { x, y: y + h, width, height: Math.max(0, height - h) }
}

/** A pool's body: the area its lanes tile. */
export const poolBody = bodyBox

/** Everything that must stay inside a group: member nodes of its subtree and nested containers. */
function contentBox(d: Diagram, id: string): Box | null {
  const ids = subtreeIds(d, id)
  const nested = d.groups.filter((g) => g.id !== id && ids.has(g.id) && g.kind !== 'lane')
  return unionBox([...membersOf(d, ids).map(boxOf), ...nested.map(boxOf)])
}

/**
 * The deepest group containing `point` that can take a dropped node: expanded,
 * visible and not locked. Lanes are deeper than their pool, so they win.
 */
export function innermostGroupAt(d: Diagram, point: Position): DiagramGroup | undefined {
  let best: DiagramGroup | undefined
  let bestDepth = -1
  for (const g of d.groups) {
    if (g.collapsed || isGroupHidden(d, g) || isGroupLocked(d, g)) continue
    const b = boxOf(g)
    if (point.x < b.x || point.x > b.x + b.width || point.y < b.y || point.y > b.y + b.height) continue
    const level = depth(d, g)
    if (level > bestDepth) {
      best = g
      bestDepth = level
    }
  }
  return best
}

/* ---------- Helpers for edits ---------- */

function mapGroups(d: Diagram, update: (g: DiagramGroup) => DiagramGroup): Diagram {
  let changed = false
  const groups = d.groups.map((g) => {
    const next = update(g)
    if (next !== g) changed = true
    return next
  })
  return changed ? { ...d, groups } : d
}

function mapNodes(d: Diagram, update: (n: DiagramNode) => DiagramNode): Diagram {
  let changed = false
  const nodes = d.nodes.map((n) => {
    const next = update(n)
    if (next !== n) changed = true
    return next
  })
  return changed ? { ...d, nodes } : d
}

const shift = (p: Position, dx: number, dy: number): Position => ({ x: p.x + dx, y: p.y + dy })

/** Moves groups (by id) and their direct member nodes by per-group deltas. */
function shiftGroups(d: Diagram, deltas: ReadonlyMap<string, Position>): Diagram {
  const moved = mapGroups(d, (g) => {
    const delta = deltas.get(g.id)
    return delta && (delta.x || delta.y) ? { ...g, position: shift(g.position, delta.x, delta.y) } : g
  })
  return mapNodes(moved, (n) => {
    const delta = n.groupId ? deltas.get(n.groupId) : undefined
    return delta && (delta.x || delta.y) ? { ...n, position: shift(n.position, delta.x, delta.y) } : n
  })
}

const withGroupId = (n: DiagramNode, groupId: string | undefined): DiagramNode => {
  if (n.groupId === groupId) return n
  const { groupId: _old, ...rest } = n
  return groupId === undefined ? rest : { ...rest, groupId }
}

const withParentId = (g: DiagramGroup, parentId: string | undefined): DiagramGroup => {
  if (g.parentId === parentId) return g
  const { parentId: _old, ...rest } = g
  return parentId === undefined ? rest : { ...rest, parentId }
}

/* ---------- Grouping ---------- */

/**
 * Wraps nodes (and whole containers) in a new container, padded, with room for
 * the header above. The new group nests inside the members' shared container,
 * if they have one. Returns null if that shared parent is a lane, since
 * containers can't sit inside lanes.
 */
export function groupItems(d: Diagram, ids: Iterable<string>, id: string, label = 'Group'): Diagram | null {
  const wanted = new Set(ids)
  const nodes = d.nodes.filter((n) => wanted.has(n.id))
  const groups = d.groups.filter((g) => wanted.has(g.id) && g.kind === 'container')
  if (nodes.length + groups.length === 0) return null
  const parents = new Set([...nodes.map((n) => n.groupId), ...groups.map((g) => g.parentId)])
  const parentId = parents.size === 1 ? [...parents][0] : undefined
  if (groupById(d, parentId)?.kind === 'lane') return null

  const box = unionBox([...nodes.map(boxOf), ...groups.map(boxOf)])!
  const group: DiagramGroup = {
    id,
    label,
    kind: 'container',
    locked: false,
    collapsed: false,
    style: {},
    position: { x: box.x - GROUP_PADDING, y: box.y - GROUP_PADDING - DEFAULT_HEADER_SIZE },
    size: { width: box.width + 2 * GROUP_PADDING, height: box.height + 2 * GROUP_PADDING + DEFAULT_HEADER_SIZE },
    ...(parentId !== undefined && { parentId }),
  }
  const nodeIds = new Set(nodes.map((n) => n.id))
  const groupIds = new Set(groups.map((g) => g.id))
  return {
    ...d,
    groups: parentsFirst([...d.groups.map((g) => (groupIds.has(g.id) ? withParentId(g, id) : g)), group]),
    nodes: d.nodes.map((n) => (nodeIds.has(n.id) ? withGroupId(n, id) : n)),
  }
}

/**
 * Removes a group, keeping everything inside in place. Members and nested
 * containers move up to its parent. Its lanes go too (a lane can't outlive
 * its pool); their members also move up.
 */
export function ungroupGroup(d: Diagram, id: string): Diagram {
  const group = groupById(d, id)
  if (!group) return d
  const up = group.parentId
  const lanes = childGroups(d, id).filter((g) => g.kind === 'lane').map((g) => g.id)
  const dissolved = new Set([id, ...lanes])
  return {
    ...d,
    groups: d.groups.filter((g) => !dissolved.has(g.id)).map((g) => (g.parentId && dissolved.has(g.parentId) ? withParentId(g, up) : g)),
    nodes: d.nodes.map((n) => (n.groupId && dissolved.has(n.groupId) ? withGroupId(n, up) : n)),
  }
}

/** Moves a group to `to`, taking every nested group and member node with it. */
export function moveGroupTo(d: Diagram, id: string, to: Position): Diagram {
  const group = groupById(d, id)
  if (!group || !Number.isFinite(to.x) || !Number.isFinite(to.y)) return d
  const dx = to.x - group.position.x
  const dy = to.y - group.position.y
  if (!dx && !dy) return d
  return shiftGroups(d, new Map([...subtreeIds(d, id)].map((g) => [g, { x: dx, y: dy }])))
}

const sameBox = (a: DiagramGroup, b: DiagramGroup) =>
  a.position.x === b.position.x && a.position.y === b.position.y && a.size.width === b.size.width && a.size.height === b.size.height

/**
 * Resizes a group without touching its members. It can't get smaller than
 * its contents plus padding (and header). A pool re-tiles its lanes, with
 * the last lane taking up any change along the stack.
 */
export function resizeGroupTo(d: Diagram, id: string, box: Box): Diagram {
  const group = groupById(d, id)
  if (!group || group.kind === 'lane' || ![box.x, box.y, box.width, box.height].every(Number.isFinite)) return d
  const h = headerSize(group)
  const side = headerSide(d, group)
  let { x, y } = box
  let right = box.x + box.width
  let bottom = box.y + box.height
  const content = contentBox(d, id)
  if (content) {
    x = Math.min(x, content.x - GROUP_PADDING - (side === 'left' ? h : 0))
    y = Math.min(y, content.y - GROUP_PADDING - (side === 'top' ? h : 0))
    right = Math.max(right, content.x + content.width + GROUP_PADDING)
    bottom = Math.max(bottom, content.y + content.height + GROUP_PADDING)
  }
  right = Math.max(right, x + h + MIN_LANE)
  bottom = Math.max(bottom, y + h + MIN_LANE)

  const pool = isPool(d, group)
  if (pool) {
    // Every lane but the last keeps its thickness; the last must still hold its members.
    const lanes = laneOrder(d, id)
    const horizontal = orientationOf(d, group) === 'horizontal'
    const thick = (l: DiagramGroup) => (horizontal ? l.size.height : l.size.width)
    const fixed = lanes.slice(0, -1).reduce((s, l) => s + thick(l), 0)
    const lastMin = minLaneThickness(d, lanes.at(-1)!)
    if (horizontal) bottom = Math.max(bottom, y + fixed + lastMin)
    else right = Math.max(right, x + h + fixed + lastMin)
  }

  const next: DiagramGroup = { ...group, position: { x, y }, size: { width: right - x, height: bottom - y } }
  if (sameBox(group, next)) return d
  const resized = mapGroups(d, (g) => (g.id === id ? next : g))
  return pool ? layoutPool(resized, id, { fillLast: true }) : resized
}

/** Puts each node into the innermost group under its centre (or none). */
export function adoptByPosition(d: Diagram, ids: Iterable<string>): Diagram {
  const wanted = new Set(ids)
  return mapNodes(d, (n) => {
    if (!wanted.has(n.id) || isNodeLocked(d, n)) return n
    const centre = { x: n.position.x + n.size.width / 2, y: n.position.y + n.size.height / 2 }
    return withGroupId(n, innermostGroupAt(d, centre)?.id)
  })
}

/** Takes nodes out of their group, into its parent (one level up), keeping them in place. */
export function removeFromGroup(d: Diagram, ids: Iterable<string>): Diagram {
  const wanted = new Set(ids)
  return mapNodes(d, (n) => (wanted.has(n.id) && n.groupId && !isNodeLocked(d, n) ? withGroupId(n, groupById(d, n.groupId)?.parentId) : n))
}

export function setGroupCollapsed(d: Diagram, id: string, collapsed: boolean): Diagram {
  return mapGroups(d, (g) => (g.id === id && g.kind === 'container' && g.collapsed !== collapsed ? { ...g, collapsed } : g))
}

export function setItemsLocked(d: Diagram, ids: Iterable<string>, locked: boolean): Diagram {
  const wanted = new Set(ids)
  const nodes = mapNodes(d, (n) => (wanted.has(n.id) && n.locked !== locked ? { ...n, locked } : n))
  return mapGroups(nodes, (g) => (wanted.has(g.id) && g.locked !== locked ? { ...g, locked } : g))
}

export function setGroupLabel(d: Diagram, id: string, label: string): Diagram {
  return mapGroups(d, (g) => (g.id === id && g.label !== label ? { ...g, label } : g))
}

/** Makes the header at least `size` thick so the title fits (never shrinks). Re-tiles a pool. */
export function growGroupHeader(d: Diagram, id: string, size: number): Diagram {
  const group = groupById(d, id)
  if (!group || !Number.isFinite(size) || size <= headerSize(group)) return d
  const grown = mapGroups(d, (g) => (g.id === id ? { ...g, headerSize: Math.ceil(Math.min(size, 400)) } : g))
  return isPool(grown, group) ? layoutPool(grown, id) : grown
}

/* ---------- Swimlanes ---------- */

/** A pool's lanes in order along the stack. */
export function laneOrder(d: Diagram, poolId: string): DiagramGroup[] {
  const lanes = childGroups(d, poolId).filter((g) => g.kind === 'lane')
  const horizontal = (lanes[0]?.orientation ?? 'horizontal') === 'horizontal'
  return lanes.sort((a, b) => (horizontal ? a.position.y - b.position.y : a.position.x - b.position.x))
}

/** Thinnest a lane can be and still hold its members. */
export function minLaneThickness(d: Diagram, lane: DiagramGroup): number {
  const horizontal = (lane.orientation ?? 'horizontal') === 'horizontal'
  const box = unionBox(membersOf(d, subtreeIds(d, lane.id)).map(boxOf))
  if (!box) return MIN_LANE
  const extent = horizontal ? box.y + box.height - lane.position.y : box.x + box.width - lane.position.x
  return Math.max(MIN_LANE, extent + GROUP_PADDING)
}

/**
 * Tiles a pool's body with its lanes, in `order` (default: current order),
 * each keeping its thickness unless overridden. The pool grows or shrinks to
 * the total, unless `fillLast`, where the last lane takes up the pool's size.
 * Lanes carry their members (and anything nested) with them.
 */
export function layoutPool(
  d: Diagram,
  poolId: string,
  options: { order?: DiagramGroup[]; thickness?: ReadonlyMap<string, number>; fillLast?: boolean } = {},
): Diagram {
  const pool = groupById(d, poolId)
  if (!pool) return d
  const lanes = options.order ?? laneOrder(d, poolId)
  if (lanes.length === 0) return d
  const horizontal = orientationOf(d, pool) === 'horizontal'
  const h = headerSize(pool)
  const sizes = lanes.map((l) => options.thickness?.get(l.id) ?? (horizontal ? l.size.height : l.size.width))
  if (options.fillLast) {
    const along = horizontal ? pool.size.height : pool.size.width - h
    sizes[sizes.length - 1] = along - sizes.slice(0, -1).reduce((s, t) => s + t, 0)
  }
  const total = sizes.reduce((s, t) => s + t, 0)
  const nextPool: DiagramGroup = {
    ...pool,
    size: horizontal ? { width: pool.size.width, height: total } : { width: total + h, height: pool.size.height },
  }
  const across = horizontal ? nextPool.size.width - h : nextPool.size.height - h

  const laneBoxes = new Map<string, Box>()
  const deltas = new Map<string, Position>()
  let cursor = horizontal ? pool.position.y : pool.position.x + h
  lanes.forEach((lane, i) => {
    const box = horizontal
      ? { x: pool.position.x + h, y: cursor, width: across, height: sizes[i]! }
      : { x: cursor, y: pool.position.y + h, width: sizes[i]!, height: across }
    laneBoxes.set(lane.id, box)
    cursor += sizes[i]!
    const current = d.groups.find((g) => g.id === lane.id) ?? lane
    for (const id of subtreeIds(d, lane.id)) deltas.set(id, { x: box.x - current.position.x, y: box.y - current.position.y })
  })

  // Shift members and nested groups with their lane, then set the lane and pool boxes exactly.
  const shifted = shiftGroups(d, deltas)
  return mapGroups(shifted, (g) => {
    if (g.id === poolId) return sameBox(g, nextPool) ? g : { ...g, size: nextPool.size }
    const box = laneBoxes.get(g.id)
    if (!box) return g
    const next = { ...g, position: { x: box.x, y: box.y }, size: { width: box.width, height: box.height } }
    return sameBox(g, next) ? g : next
  })
}

/** A new pool with three lanes ("Lane 1".."Lane 3") centred on `center`. */
export function createPool(d: Diagram, center: Position, orientation: Orientation, ids: { pool: string; lanes: string[] }): Diagram {
  const thickness = DEFAULT_LANE_THICKNESS[orientation]
  const run = DEFAULT_LANE_RUN[orientation]
  const h = DEFAULT_HEADER_SIZE
  const horizontal = orientation === 'horizontal'
  const size = horizontal ? { width: run + h, height: thickness * 3 } : { width: thickness * 3, height: run + h }
  const pool: DiagramGroup = {
    id: ids.pool,
    label: 'Pool',
    kind: 'container',
    orientation,
    locked: false,
    collapsed: false,
    style: {},
    position: { x: Math.round(center.x - size.width / 2), y: Math.round(center.y - size.height / 2) },
    size,
  }
  const lanes: DiagramGroup[] = ids.lanes.slice(0, 3).map((id, i) => ({
    id,
    label: `Lane ${i + 1}`,
    kind: 'lane',
    parentId: ids.pool,
    orientation,
    locked: false,
    collapsed: false,
    style: {},
    position: horizontal ? { x: pool.position.x + h, y: pool.position.y + i * thickness } : { x: pool.position.x + i * thickness, y: pool.position.y + h },
    size: horizontal ? { width: run, height: thickness } : { width: thickness, height: run },
  }))
  return { ...d, groups: [...d.groups, pool, ...lanes] }
}

/** Inserts a new lane before or after `laneId`; the pool grows and later lanes shift. */
export function insertLane(d: Diagram, laneId: string, where: 'before' | 'after', id: string): Diagram {
  const lane = groupById(d, laneId)
  if (!lane || lane.kind !== 'lane' || !lane.parentId) return d
  const lanes = laneOrder(d, lane.parentId)
  const horizontal = (lane.orientation ?? 'horizontal') === 'horizontal'
  const created: DiagramGroup = {
    id,
    label: `Lane ${lanes.length + 1}`,
    kind: 'lane',
    parentId: lane.parentId,
    orientation: lane.orientation ?? 'horizontal',
    locked: false,
    collapsed: false,
    style: {},
    position: lane.position,
    size: horizontal ? { width: lane.size.width, height: DEFAULT_LANE_THICKNESS.horizontal } : { width: DEFAULT_LANE_THICKNESS.vertical, height: lane.size.height },
  }
  const index = lanes.findIndex((l) => l.id === laneId) + (where === 'after' ? 1 : 0)
  const order = [...lanes.slice(0, index), created, ...lanes.slice(index)]
  return layoutPool({ ...d, groups: [...d.groups, created] }, lane.parentId, { order })
}

/** Removes a lane. Its members stay where they are but now belong to the pool. */
export function removeLane(d: Diagram, laneId: string): Diagram {
  const lane = groupById(d, laneId)
  if (!lane || lane.kind !== 'lane' || !lane.parentId) return d
  const poolId = lane.parentId
  const without: Diagram = {
    ...d,
    groups: d.groups.filter((g) => g.id !== laneId).map((g) => (g.parentId === laneId ? withParentId(g, poolId) : g)),
    nodes: d.nodes.map((n) => (n.groupId === laneId ? withGroupId(n, poolId) : n)),
  }
  return laneOrder(without, poolId).length > 0 ? layoutPool(without, poolId) : without
}

/** Swaps a lane with its neighbour (-1 earlier, +1 later). */
export function reorderLane(d: Diagram, laneId: string, direction: -1 | 1): Diagram {
  const lane = groupById(d, laneId)
  if (!lane || lane.kind !== 'lane' || !lane.parentId) return d
  const order = laneOrder(d, lane.parentId)
  const i = order.findIndex((l) => l.id === laneId)
  const j = i + direction
  if (j < 0 || j >= order.length) return d
  ;[order[i], order[j]] = [order[j]!, order[i]!]
  return layoutPool(d, lane.parentId, { order })
}

/** Sets a lane's thickness (clamped to hold its members); the pool grows or shrinks to match. */
export function setLaneThickness(d: Diagram, laneId: string, thickness: number): Diagram {
  const lane = groupById(d, laneId)
  if (!lane || lane.kind !== 'lane' || !lane.parentId || !Number.isFinite(thickness)) return d
  const value = Math.max(minLaneThickness(d, lane), Math.round(thickness))
  return layoutPool(d, lane.parentId, { thickness: new Map([[laneId, value]]) })
}
