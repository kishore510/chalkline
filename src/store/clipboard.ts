import { z } from 'zod'
import { createId } from '@/lib/id'
import { EdgeSchema, NodeSchema, SCHEMA_VERSION, type Diagram, type DiagramEdge, type DiagramNode, type Position } from '@/schema/diagram'

/** Copied shapes plus the connectors between them. */
export interface Fragment {
  nodes: DiagramNode[]
  edges: DiagramEdge[]
}

/** Selected nodes and every edge running between two of them. Null if no node is selected. */
export function copyFragment(diagram: Diagram, ids: Iterable<string>): Fragment | null {
  const selected = new Set(ids)
  const nodes = diagram.nodes.filter((n) => selected.has(n.id))
  if (nodes.length === 0) return null
  const nodeIds = new Set(nodes.map((n) => n.id))
  const edges = diagram.edges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
  return { nodes, edges }
}

export function fragmentBounds(fragment: Fragment) {
  const xs = fragment.nodes.flatMap((n) => [n.position.x, n.position.x + n.size.width])
  const ys = fragment.nodes.flatMap((n) => [n.position.y, n.position.y + n.size.height])
  return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) }
}

/**
 * Adds a copy of the fragment with fresh ids, moved by `offset`. Edges whose
 * ends aren't both in the fragment are dropped, as are links to groups that
 * don't exist in this diagram. Returns the new ids (nodes, then edges).
 */
export function pasteFragment(diagram: Diagram, fragment: Fragment, offset: Position): { diagram: Diagram; ids: string[] } {
  const idMap = new Map(fragment.nodes.map((n) => [n.id, createId('n_')]))
  const groups = new Set(diagram.groups.map((g) => g.id))
  const nodes = fragment.nodes.map(({ groupId, ...node }) => ({
    ...node,
    id: idMap.get(node.id)!,
    position: { x: node.position.x + offset.x, y: node.position.y + offset.y },
    ...(groupId && groups.has(groupId) && { groupId }),
  }))
  const edges = fragment.edges
    .filter((e) => idMap.has(e.source) && idMap.has(e.target))
    .map((e) => ({ ...e, id: createId('e_'), source: idMap.get(e.source)!, target: idMap.get(e.target)! }))
  return {
    diagram: { ...diagram, nodes: [...diagram.nodes, ...nodes], edges: [...diagram.edges, ...edges] },
    ids: [...nodes.map((n) => n.id), ...edges.map((e) => e.id)],
  }
}

const MARKER = 'fragment'

/** Clipboard text for a fragment, so copy/paste also works between tabs. */
export function serializeFragment(fragment: Fragment): string {
  return JSON.stringify({ chalkline: MARKER, version: SCHEMA_VERSION, nodes: fragment.nodes, edges: fragment.edges })
}

const FragmentSchema = z.object({
  chalkline: z.literal(MARKER),
  version: z.literal(SCHEMA_VERSION),
  nodes: z.array(NodeSchema).min(1),
  edges: z.array(EdgeSchema),
})

/** Parses clipboard text; null if it isn't a valid Chalkline fragment. */
export function parseFragment(text: string): Fragment | null {
  try {
    const result = FragmentSchema.safeParse(JSON.parse(text))
    return result.success ? { nodes: result.data.nodes, edges: result.data.edges } : null
  } catch {
    return null
  }
}
