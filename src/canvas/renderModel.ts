import type { Diagram, DiagramEdge, DiagramGroup, DiagramNode } from '@/schema/diagram'
import { ancestors, depth, headerSide, headerSize, isGroupLocked, isPool, parentsFirst, type Box } from '@/store/groups'
import type { RoutableNode } from './routing'

/*
 * What the canvas draws, derived from the diagram without changing it.
 * Collapsing a group is purely visual: its members are hidden, it shrinks to
 * its header, and connectors to hidden members end on the group instead.
 */

export interface GroupView {
  group: DiagramGroup
  /** What's drawn: the full box, or just the header bar when collapsed. */
  box: Box
  depth: number
  side: 'top' | 'left'
  header: number
  locked: boolean
  pool: boolean
}

export interface RenderModel {
  /** Visible groups, parents before children. */
  groups: GroupView[]
  /** Nodes inside a collapsed group. */
  hiddenNodes: ReadonlySet<string>
  /** Visible edges, with ends moved to a collapsed group where needed. */
  edges: DiagramEdge[]
  /** Visible nodes plus collapsed groups, for routing (and as edge endpoints). */
  routingNodes: RoutableNode[]
}

/** The bar a collapsed group shrinks to. */
export function collapsedBox(group: DiagramGroup): Box {
  return { x: group.position.x, y: group.position.y, width: group.size.width, height: headerSize(group) }
}

// Stable pseudo-nodes for collapsed groups, so routes and edges aren't rebuilt needlessly.
const pseudoNodes = new WeakMap<DiagramGroup, RoutableNode>()
function pseudoNode(group: DiagramGroup): RoutableNode {
  let node = pseudoNodes.get(group)
  if (!node) {
    const box = collapsedBox(group)
    node = { id: group.id, position: { x: box.x, y: box.y }, size: { width: box.width, height: box.height } }
    pseudoNodes.set(group, node)
  }
  return node
}

// Remapped copies of edges, kept while the edge and its new ends are unchanged.
const remapped = new WeakMap<DiagramEdge, { source: string; target: string; edge: DiagramEdge }>()
function withEnds(edge: DiagramEdge, source: string, target: string): DiagramEdge {
  if (source === edge.source && target === edge.target) return edge
  const hit = remapped.get(edge)
  if (hit && hit.source === source && hit.target === target) return hit.edge
  // A pinned side belongs to the original node; the group end floats.
  const { sourceHandle, targetHandle, ...rest } = edge
  const next: DiagramEdge = {
    ...rest,
    source,
    target,
    ...(source === edge.source && sourceHandle !== undefined && { sourceHandle }),
    ...(target === edge.target && targetHandle !== undefined && { targetHandle }),
  }
  remapped.set(edge, { source, target, edge: next })
  return next
}

export function buildRenderModel(diagram: Diagram): RenderModel {
  const groupsById = new Map(diagram.groups.map((g) => [g.id, g]))

  // The outermost collapsed group around a group, if any (itself included).
  const collapsedAround = new Map<string, string | undefined>()
  const outermostCollapsed = (group: DiagramGroup): string | undefined => {
    if (collapsedAround.has(group.id)) return collapsedAround.get(group.id)
    let found: string | undefined
    for (const g of [group, ...ancestors(diagram, group)]) if (g.collapsed) found = g.id
    collapsedAround.set(group.id, found)
    return found
  }

  const groups: GroupView[] = []
  for (const group of parentsFirst(diagram.groups)) {
    const around = outermostCollapsed(group)
    // Hidden if an ancestor (not the group itself) is collapsed.
    if (around !== undefined && around !== group.id) continue
    groups.push({
      group,
      box: group.collapsed ? collapsedBox(group) : { ...group.position, ...group.size },
      depth: depth(diagram, group),
      side: group.collapsed ? 'top' : headerSide(diagram, group),
      header: headerSize(group),
      locked: isGroupLocked(diagram, group),
      pool: isPool(diagram, group),
    })
  }

  const hiddenNodes = new Set<string>()
  const endpoint = new Map<string, string>()
  const visibleNodes: DiagramNode[] = []
  for (const node of diagram.nodes) {
    const group = node.groupId ? groupsById.get(node.groupId) : undefined
    const around = group ? outermostCollapsed(group) : undefined
    if (around) {
      hiddenNodes.add(node.id)
      endpoint.set(node.id, around)
    } else {
      visibleNodes.push(node)
    }
  }

  const edges: DiagramEdge[] = []
  for (const edge of diagram.edges) {
    const source = endpoint.get(edge.source) ?? edge.source
    const target = endpoint.get(edge.target) ?? edge.target
    // Both ends inside the same collapsed group: nothing to draw.
    if (source === target) continue
    edges.push(withEnds(edge, source, target))
  }

  const collapsed = groups.filter((v) => v.group.collapsed).map((v) => pseudoNode(v.group))
  return { groups, hiddenNodes, edges, routingNodes: [...visibleNodes, ...collapsed] }
}
