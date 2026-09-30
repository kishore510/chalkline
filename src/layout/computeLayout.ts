import type { ElkExtendedEdge, ElkNode } from 'elkjs/lib/elk-api'
import type { Diagram, DiagramGroup, DiagramNode, Position } from '@/schema/diagram'
import { GROUP_PADDING, headerSize, isGroupFixed, isNodeLocked, isPool, subtreeIds, type Box } from '@/store/groups'
import { isGroupFrameHidden, isNodeHidden } from '@/store/layers'

/*
 * Auto-arrange. Pure and async: builds an ELK layered graph (hierarchical, so
 * containers are laid out with their members inside), runs it, and returns new
 * absolute positions and container boxes. It never touches the store.
 *
 * Left as they are: swimlane pools (and everything in them), locked shapes and
 * groups, and containers holding locked shapes. Nothing is placed on top of
 * anything that isn't moving.
 */

export type LayoutDirection = 'right' | 'down'
export type LayoutSpacing = 'compact' | 'normal' | 'roomy'

export interface LayoutOptions {
  direction: LayoutDirection
  spacing: LayoutSpacing
  /** Selected ids to arrange; empty or missing means the whole diagram. */
  scope?: readonly string[]
  /** Snap results to this grid (0 or missing: no snapping). */
  grid?: number
  /** How many times to shift the result clear of fixed items before giving up. */
  searchLimit?: number
}

/** The part of the ELK API we use, so tests can pass the bundled build and the app a worker. */
export interface ElkLike {
  layout(graph: ElkNode): Promise<ElkNode>
}

export interface LayoutChanges {
  /** New absolute top-left positions of shapes. */
  nodes: Map<string, Position>
  /** New boxes of containers laid out with their members. */
  groups: Map<string, Box>
  /** Collapsed containers moved as a block (their contents move with them). */
  groupMoves: Map<string, Position>
}

export type LayoutResult =
  | (LayoutChanges & { ok: true; arranged: number; skipped: Skipped; message: string })
  | { ok: false; message: string }

/** What was left alone, and why. */
export interface Skipped {
  locked: number
  pools: number
  grouped: number
  hidden: number
}

export const SPACING: Record<LayoutSpacing, number> = { compact: 24, normal: 48, roomy: 88 }
const DEFAULT_SEARCH_LIMIT = 40

const snap = (v: number, grid: number) => (grid > 0 ? Math.round(v / grid) * grid : v)
const boxOf = (item: { position: Position; size: { width: number; height: number } }): Box => ({ ...item.position, ...item.size })
const overlaps = (a: Box, b: Box, gap: number) =>
  a.x < b.x + b.width + gap && b.x < a.x + a.width + gap && a.y < b.y + b.height + gap && b.y < a.y + a.height + gap

function union(boxes: Box[]): Box | null {
  if (boxes.length === 0) return null
  const x = Math.min(...boxes.map((b) => b.x))
  const y = Math.min(...boxes.map((b) => b.y))
  return { x, y, width: Math.max(...boxes.map((b) => b.x + b.width)) - x, height: Math.max(...boxes.map((b) => b.y + b.height)) - y }
}

export async function computeLayout(diagram: Diagram, options: LayoutOptions, elk: ElkLike): Promise<LayoutResult> {
  const groupsById = new Map(diagram.groups.map((g) => [g.id, g]))
  const skipped: Skipped = { locked: 0, pools: 0, grouped: 0, hidden: 0 }

  // --- Which groups can't move: pools (and their lanes), locked groups, containers holding locked shapes.
  const frozen = new Set<string>()
  for (const g of diagram.groups) {
    if (frozen.has(g.id)) continue
    const tree = subtreeIds(diagram, g.id)
    const holdsLocked = diagram.nodes.some((n) => n.groupId && tree.has(n.groupId) && n.locked)
    if (isPool(diagram, g)) skipped.pools++
    else if (isGroupFixed(diagram, g) || holdsLocked) skipped.locked++
    // A group whose frame is on a hidden layer stays put (with its contents).
    else if (isGroupFrameHidden(diagram, g)) skipped.hidden++
    else continue
    for (const id of tree) frozen.add(id)
  }
  // Lanes are only ever inside pools, but be safe.
  for (const g of diagram.groups) if (g.kind === 'lane') frozen.add(g.id)

  // --- What's in scope.
  const selection = new Set(options.scope ?? [])
  const whole = selection.size === 0
  const groupInScope = new Map<string, boolean>()
  const inScope = (g: DiagramGroup | undefined): boolean => {
    if (!g || frozen.has(g.id) || g.kind !== 'container') return false
    const cached = groupInScope.get(g.id)
    if (cached !== undefined) return cached
    const parent = g.parentId ? groupsById.get(g.parentId) : undefined
    const result = whole ? !parent || inScope(parent) : selection.has(g.id) || inScope(parent)
    groupInScope.set(g.id, result)
    return result
  }
  const scopedGroups = diagram.groups.filter((g) => inScope(g))
  const scopedGroupIds = new Set(scopedGroups.map((g) => g.id))

  const scopedNodes: DiagramNode[] = []
  for (const n of diagram.nodes) {
    const group = n.groupId ? groupsById.get(n.groupId) : undefined
    const wanted = whole || selection.has(n.id) || (group !== undefined && scopedGroupIds.has(group.id))
    if (!wanted) continue
    if (isNodeHidden(diagram, n)) {
      skipped.hidden++
      continue
    }
    if (isNodeLocked(diagram, n)) {
      if (!group || !frozen.has(group.id)) skipped.locked++
      continue
    }
    if (group && !scopedGroupIds.has(group.id)) {
      // Inside a group that isn't being arranged (a pool, or an unselected group).
      if (!frozen.has(group.id)) skipped.grouped++
      continue
    }
    scopedNodes.push(n)
  }

  if (scopedNodes.length + scopedGroups.length === 0) {
    return { ok: false, message: messageFor(0, skipped) || 'Nothing to arrange.' }
  }

  // --- Build the ELK graph. Collapsed containers are single blocks.
  const spacing = SPACING[options.spacing]
  const direction = options.direction === 'right' ? 'RIGHT' : 'DOWN'
  const algorithmOptions = {
    'elk.algorithm': 'layered',
    'elk.direction': direction,
    'elk.spacing.nodeNode': String(spacing),
    'elk.layered.spacing.nodeNodeBetweenLayers': String(Math.round(spacing * 1.5)),
    'elk.spacing.componentComponent': String(spacing),
    'elk.layered.spacing.edgeNodeBetweenLayers': String(Math.round(spacing / 2)),
  }
  const collapsedAncestor = (groupId: string | undefined): string | undefined => {
    let found: string | undefined
    for (let g = groupId ? groupsById.get(groupId) : undefined; g && scopedGroupIds.has(g.id); g = g.parentId ? groupsById.get(g.parentId) : undefined) {
      if (g.collapsed) found = g.id
    }
    return found
  }

  const nodesByGroup = new Map<string | undefined, DiagramNode[]>()
  for (const n of scopedNodes) {
    const key = n.groupId && scopedGroupIds.has(n.groupId) ? n.groupId : undefined
    nodesByGroup.set(key, [...(nodesByGroup.get(key) ?? []), n])
  }
  const groupsByParent = new Map<string | undefined, DiagramGroup[]>()
  for (const g of scopedGroups) {
    const key = g.parentId && scopedGroupIds.has(g.parentId) ? g.parentId : undefined
    groupsByParent.set(key, [...(groupsByParent.get(key) ?? []), g])
  }

  const leafNode = (n: DiagramNode): ElkNode => ({ id: n.id, width: n.size.width, height: n.size.height })
  const groupNode = (g: DiagramGroup): ElkNode => {
    if (g.collapsed) return { id: g.id, width: g.size.width, height: headerSize(g) }
    return {
      id: g.id,
      layoutOptions: { ...algorithmOptions, 'elk.padding': `[top=${GROUP_PADDING + headerSize(g)},left=${GROUP_PADDING},bottom=${GROUP_PADDING},right=${GROUP_PADDING}]` },
      children: [...(groupsByParent.get(g.id) ?? []).map(groupNode), ...(nodesByGroup.get(g.id) ?? []).map(leafNode)],
    }
  }
  const roots: ElkNode[] = [...(groupsByParent.get(undefined) ?? []).map(groupNode), ...(nodesByGroup.get(undefined) ?? []).map(leafNode)]

  // Edges between laid-out items; ends inside a collapsed container attach to it.
  const laidOut = new Set(scopedNodes.filter((n) => !collapsedAncestor(n.groupId)).map((n) => n.id))
  const endpoint = (id: string): string | undefined => {
    const n = diagram.nodes.find((x) => x.id === id)
    if (!n || !scopedNodes.includes(n)) return undefined
    return collapsedAncestor(n.groupId) ?? (laidOut.has(id) ? id : undefined)
  }
  const edges: ElkExtendedEdge[] = []
  for (const e of diagram.edges) {
    const s = endpoint(e.source)
    const t = endpoint(e.target)
    if (s && t && s !== t) edges.push({ id: `edge:${e.id}`, sources: [s], targets: [t] })
  }

  let result: ElkNode
  try {
    result = await elk.layout({
      id: 'root',
      layoutOptions: { ...algorithmOptions, 'elk.hierarchyHandling': 'INCLUDE_CHILDREN', 'elk.padding': '[top=0,left=0,bottom=0,right=0]' },
      children: roots,
      edges,
    })
  } catch {
    return { ok: false, message: 'Auto-arrange failed on this diagram. Nothing was changed.' }
  }

  // --- Back to absolute coordinates.
  const nodes = new Map<string, Position>()
  const groups = new Map<string, Box>()
  const groupMoves = new Map<string, Position>()
  const visit = (elkNode: ElkNode, parentX: number, parentY: number) => {
    const x = parentX + (elkNode.x ?? 0)
    const y = parentY + (elkNode.y ?? 0)
    const group = groupsById.get(elkNode.id)
    if (group) {
      if (group.collapsed) groupMoves.set(group.id, { x, y })
      else groups.set(group.id, { x, y, width: elkNode.width ?? group.size.width, height: elkNode.height ?? group.size.height })
    } else {
      nodes.set(elkNode.id, { x, y })
    }
    for (const child of elkNode.children ?? []) visit(child, x, y)
  }
  for (const child of result.children ?? []) visit(child, 0, 0)

  // --- Put the block where the arranged items were, then snap and re-fit containers.
  const rootIds = roots.map((r) => r.id)
  const before = union(rootIds.map((id) => boxOf(groupsById.get(id) ?? diagram.nodes.find((n) => n.id === id)!)))!
  const after = union(rootIds.map((id) => currentBox(id)))!
  function currentBox(id: string): Box {
    const g = groupsById.get(id)
    if (g) {
      const move = groupMoves.get(id)
      return move ? { ...move, width: g.size.width, height: headerSize(g) } : groups.get(id)!
    }
    const n = diagram.nodes.find((x) => x.id === id)!
    return { ...nodes.get(id)!, ...n.size }
  }
  shiftAll(before.x - after.x, before.y - after.y)

  const grid = options.grid ?? 0
  function shiftAll(dx: number, dy: number) {
    for (const [id, p] of nodes) nodes.set(id, { x: p.x + dx, y: p.y + dy })
    for (const [id, p] of groupMoves) groupMoves.set(id, { x: p.x + dx, y: p.y + dy })
    for (const [id, b] of groups) groups.set(id, { ...b, x: b.x + dx, y: b.y + dy })
  }
  function snapAndFit() {
    for (const [id, p] of nodes) nodes.set(id, { x: snap(p.x, grid), y: snap(p.y, grid) })
    for (const [id, p] of groupMoves) groupMoves.set(id, { x: snap(p.x, grid), y: snap(p.y, grid) })
    // Containers hug their contents plus padding and header, innermost first.
    const byDepth = [...groups.keys()].sort((a, b) => depthOf(b) - depthOf(a))
    for (const id of byDepth) {
      const g = groupsById.get(id)!
      const children = [
        ...scopedNodes.filter((n) => n.groupId === id).map((n) => ({ ...nodes.get(n.id)!, ...n.size })),
        ...scopedGroups.filter((c) => c.parentId === id).map((c) => currentBox(c.id)),
      ]
      const content = union(children)
      if (!content) continue
      const top = GROUP_PADDING + headerSize(g)
      let x = content.x - GROUP_PADDING
      let y = content.y - top
      if (grid > 0) {
        x = Math.floor(x / grid) * grid
        y = Math.floor(y / grid) * grid
      }
      groups.set(id, { x, y, width: content.x + content.width + GROUP_PADDING - x, height: content.y + content.height + GROUP_PADDING - y })
    }
  }
  function depthOf(id: string) {
    let d = 0
    for (let g = groupsById.get(id); g?.parentId; g = groupsById.get(g.parentId)) d++
    return d
  }
  snapAndFit()

  // --- Keep clear of everything that isn't moving: shift right past it until clear.
  const moving = new Set<string>([...nodes.keys(), ...groups.keys(), ...groupMoves.keys()])
  const movingTree = new Set<string>()
  for (const id of [...groups.keys(), ...groupMoves.keys()]) for (const s of subtreeIds(diagram, id)) movingTree.add(s)
  // Hidden shapes and frames aren't obstacles: they're neither drawn nor moved.
  const fixed: Box[] = [
    ...diagram.nodes.filter((n) => !moving.has(n.id) && !(n.groupId && movingTree.has(n.groupId)) && !isNodeHidden(diagram, n)).map(boxOf),
    // Only outermost fixed groups matter; their contents are inside them.
    ...diagram.groups
      .filter((g) => !movingTree.has(g.id) && !isGroupFrameHidden(diagram, g) && !(g.parentId && !movingTree.has(g.parentId) && groupsById.has(g.parentId)))
      .map((g) =>
      g.collapsed ? { ...g.position, width: g.size.width, height: headerSize(g) } : boxOf(g),
    ),
  ]
  const placed = () => rootIds.map((id) => currentBox(id))
  const limit = options.searchLimit ?? DEFAULT_SEARCH_LIMIT
  for (let attempt = 0; ; attempt++) {
    const clashes = placed().flatMap((b) => fixed.filter((f) => overlaps(b, f, GROUP_PADDING)).map((f) => ({ b, f })))
    if (clashes.length === 0) break
    if (attempt >= limit) {
      return { ok: false, message: 'Couldn’t find room to arrange without overlapping locked or unselected items. Nothing was changed.' }
    }
    const push = Math.max(...clashes.map(({ b, f }) => f.x + f.width + GROUP_PADDING - b.x))
    shiftAll(grid > 0 ? Math.ceil(push / grid) * grid : push, 0)
  }

  const arranged = nodes.size + [...groupMoves.keys()].reduce((sum, id) => sum + scopedNodes.filter((n) => n.groupId && subtreeIds(diagram, id).has(n.groupId)).length, 0)
  return { ok: true, nodes, groups, groupMoves, arranged, skipped, message: messageFor(arranged, skipped) }
}

function messageFor(arranged: number, skipped: Skipped): string {
  const parts = arranged > 0 ? [`Arranged ${arranged} ${arranged === 1 ? 'shape' : 'shapes'}.`] : []
  if (skipped.pools) parts.push(skipped.pools === 1 ? 'The swimlane pool was left as it is.' : `${skipped.pools} swimlane pools were left as they are.`)
  if (skipped.locked) parts.push('Locked items stayed put.')
  if (skipped.grouped) parts.push('Shapes inside a group move with it: select the group to arrange them.')
  if (skipped.hidden) parts.push(`${skipped.hidden} hidden ${skipped.hidden === 1 ? 'item was' : 'items were'} left as they are.`)
  return parts.join(' ')
}
