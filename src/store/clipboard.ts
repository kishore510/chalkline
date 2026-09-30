import { z } from 'zod'
import { createId } from '@/lib/id'
import { EdgeSchema, GroupSchema, NodeSchema, SCHEMA_VERSION, type Diagram, type DiagramEdge, type DiagramGroup, type DiagramNode, type Position } from '@/schema/diagram'
import { membersOf, parentsFirst, subtreeIds } from './groups'

/** Copied shapes and groups, plus the connectors between the shapes. */
export interface Fragment {
  nodes: DiagramNode[]
  edges: DiagramEdge[]
  groups: DiagramGroup[]
}

/**
 * Selected nodes and containers (each with everything nested inside, lanes
 * included), plus every edge running between two copied nodes. A lane selected
 * on its own isn't copied as a lane (it can't exist outside its pool), only
 * its members are. Null if nothing copyable is selected.
 */
export function copyFragment(diagram: Diagram, ids: Iterable<string>): Fragment | null {
  const selected = new Set(ids)
  const groupIds = new Set<string>()
  for (const g of diagram.groups) {
    if (selected.has(g.id) && g.kind === 'container') for (const id of subtreeIds(diagram, g.id)) groupIds.add(id)
  }
  const laneMembers = diagram.groups.filter((g) => selected.has(g.id) && g.kind === 'lane').map((g) => g.id)
  const nodeIds = new Set([
    ...diagram.nodes.filter((n) => selected.has(n.id)).map((n) => n.id),
    ...membersOf(diagram, groupIds).map((n) => n.id),
    ...membersOf(diagram, new Set(laneMembers)).map((n) => n.id),
  ])
  const nodes = diagram.nodes.filter((n) => nodeIds.has(n.id))
  const groups = parentsFirst(diagram.groups.filter((g) => groupIds.has(g.id)))
  if (nodes.length + groups.length === 0) return null
  const edges = diagram.edges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
  return { nodes, edges, groups }
}

export function fragmentBounds(fragment: Fragment) {
  const items = [...fragment.nodes, ...fragment.groups]
  const xs = items.flatMap((n) => [n.position.x, n.position.x + n.size.width])
  const ys = items.flatMap((n) => [n.position.y, n.position.y + n.size.height])
  return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) }
}

/**
 * Adds a copy of the fragment with fresh ids, moved by `offset`. Group
 * membership and nesting are remapped to the copies; a link to a group
 * outside the fragment is kept only if that group exists here (and can take
 * it). Edges whose ends aren't both in the fragment are dropped. Returns the
 * new ids (groups, nodes, then edges).
 */
export function pasteFragment(diagram: Diagram, fragment: Fragment, offset: Position): { diagram: Diagram; ids: string[] } {
  const groupMap = new Map(fragment.groups.map((g) => [g.id, createId('g_')]))
  const nodeMap = new Map(fragment.nodes.map((n) => [n.id, createId('n_')]))
  const existing = new Map(diagram.groups.map((g) => [g.id, g]))
  const move = (p: Position) => ({ x: p.x + offset.x, y: p.y + offset.y })

  const groups = fragment.groups.map(({ parentId, ...g }) => {
    const parent = parentId ? (groupMap.get(parentId) ?? (existing.get(parentId)?.kind === 'container' && g.kind === 'container' ? parentId : undefined)) : undefined
    return { ...g, id: groupMap.get(g.id)!, position: move(g.position), ...(parent && { parentId: parent }) }
  })
  const nodes = fragment.nodes.map(({ groupId, ...node }) => {
    const group = groupId ? (groupMap.get(groupId) ?? (existing.has(groupId) ? groupId : undefined)) : undefined
    return { ...node, id: nodeMap.get(node.id)!, position: move(node.position), ...(group && { groupId: group }) }
  })
  const edges = fragment.edges
    .filter((e) => nodeMap.has(e.source) && nodeMap.has(e.target))
    .map((e) => ({ ...e, id: createId('e_'), source: nodeMap.get(e.source)!, target: nodeMap.get(e.target)! }))
  return {
    diagram: { ...diagram, groups: [...diagram.groups, ...groups], nodes: [...diagram.nodes, ...nodes], edges: [...diagram.edges, ...edges] },
    ids: [...groups.map((g) => g.id), ...nodes.map((n) => n.id), ...edges.map((e) => e.id)],
  }
}

const MARKER = 'fragment'

/** Clipboard text for a fragment, so copy/paste also works between tabs. */
export function serializeFragment(fragment: Fragment): string {
  return JSON.stringify({ chalkline: MARKER, version: SCHEMA_VERSION, nodes: fragment.nodes, edges: fragment.edges, groups: fragment.groups })
}

const FragmentSchema = z
  .object({
    chalkline: z.literal(MARKER),
    version: z.literal(SCHEMA_VERSION),
    nodes: z.array(NodeSchema),
    edges: z.array(EdgeSchema),
    groups: z.array(GroupSchema).default([]),
  })
  .refine((f) => f.nodes.length + f.groups.length > 0)

/** Parses clipboard text; null if it isn't a valid Chalkline fragment. */
export function parseFragment(text: string): Fragment | null {
  try {
    const result = FragmentSchema.safeParse(JSON.parse(text))
    return result.success ? { nodes: result.data.nodes, edges: result.data.edges, groups: result.data.groups } : null
  } catch {
    return null
  }
}
