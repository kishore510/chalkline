import type { ElkLike } from '@/layout/computeLayout'
import { createEmptyDiagram, DiagramSchema, type Diagram, type DiagramEdge, type DiagramNode, type EdgeStyle, type Position, type Size } from '@/schema/diagram'
import { createEdge } from '@/schema/factories'
import type { StencilContent } from '@/stencils/format'
import { fragmentBounds } from '@/store/clipboard'
import { headerSize, unionBox, type Box } from '@/store/groups'
import { isGroupFrameHidden, isNodeHidden } from '@/store/layers'
import { placeInFreeSpace } from '@/store/placement'
import type { GeneratedDiagram, GeneratedEdge } from './generated'
import { edgeStyleFor, layoutGenerated } from './generatedLayout'
import { edgeKey } from './refineContract'
import { applyFixes, type RefineFix } from './refineFixes'

/*
 * Refine's layout: ELK lays out the NEW shapes and the connectors between
 * them, on their own (the 6b layout). Connectors to existing shapes (and new
 * connectors between two existing shapes) are kept aside, with real ids.
 * Then the block is placed beside the selection, in empty space, on the
 * grid. Existing shapes are never moved: placement only looks at them.
 */

type Arrowhead = NonNullable<EdgeStyle['endArrow']>

/** New items laid out with their top-left at 0,0, and the connectors to existing shapes. */
export interface RefineLaidOut {
  /** New shapes and the connectors between them (top-left at 0,0). */
  content: Pick<StencilContent, 'nodes' | 'edges'>
  /** New connectors with one or both ends on an existing shape (its real id). */
  links: DiagramEdge[]
  /** The model's reason for each new shape and connector, by its id here. */
  why: ReadonlyMap<string, string>
}

export type RefineLayoutOutcome = { ok: true; value: RefineLaidOut } | { ok: false; message: string }

/**
 * Lays out a checked refine answer. `refs` maps the existing refs sent to
 * their real ids; the model never sees those ids. `generated` is null when
 * the answer adds no shapes (only connectors between existing ones, or fixes).
 */
export async function layoutRefinement(
  generated: GeneratedDiagram | null,
  bridges: readonly GeneratedEdge[],
  refs: ReadonlyMap<string, string>,
  elk: ElkLike,
  { grid, arrowhead, why = { nodes: new Map(), edges: new Map() } }: { grid: number; arrowhead: Arrowhead; why?: { nodes: ReadonlyMap<string, string>; edges: ReadonlyMap<string, string> } },
): Promise<RefineLayoutOutcome> {
  const reasons = new Map<string, string>()
  let content: RefineLaidOut['content'] = { nodes: [], edges: [] }
  const idOf = new Map<string, string>()
  const genNodes = generated?.nodes ?? []
  const local = new Set(genNodes.map((n) => n.id))
  const genEdges = generated?.edges ?? []
  if (generated) {
    const inner = genEdges.filter((e) => local.has(e.from) && local.has(e.to))
    const laid = await layoutGenerated({ nodes: generated.nodes, edges: inner, groups: [] }, elk, { grid, arrowhead })
    if (!laid.ok) return laid
    content = { nodes: laid.value.content.nodes, edges: laid.value.content.edges }
    // Nodes come back in the order they were given, with fresh ids.
    genNodes.forEach((n, i) => {
      const id = content.nodes[i]!.id
      idOf.set(n.id, id)
      const reason = why.nodes.get(n.id)
      if (reason) reasons.set(id, reason)
    })
    const modelIdOf = new Map([...idOf].map(([k, v]) => [v, k]))
    for (const e of content.edges) {
      const reason = why.edges.get(edgeKey(modelIdOf.get(e.source) ?? '', modelIdOf.get(e.target) ?? ''))
      if (reason) reasons.set(e.id, reason)
    }
  }
  const end = (value: string) => idOf.get(value) ?? refs.get(value)
  const links: DiagramEdge[] = []
  for (const e of [...genEdges.filter((e) => !(local.has(e.from) && local.has(e.to))), ...bridges]) {
    const source = end(e.from)
    const target = end(e.to)
    if (!source || !target) continue
    const edge = createEdge(source, target, { label: e.label ?? '', style: edgeStyleFor(e, arrowhead) })
    const reason = why.edges.get(edgeKey(e.from, e.to))
    if (reason) reasons.set(edge.id, reason)
    links.push(edge)
  }
  return { ok: true, value: { content, links, why: reasons } }
}

/** Space between the selection and the new shapes, and the step when that spot is taken. */
export const REFINE_GAP = 80
/** Clear space kept around existing shapes. */
export const REFINE_MARGIN = 24
/** How many steps outward to try before falling back to beside everything. */
const MAX_STEPS = 60

const overlaps = (a: Box, b: Box, margin: number) =>
  a.x < b.x + b.width + margin && b.x < a.x + a.width + margin && a.y < b.y + b.height + margin && b.y < a.y + a.height + margin

/** What new shapes must not cover: visible shapes and group frames (full size, so expanding a collapsed group covers nothing). */
export function visibleObstacles(diagram: Diagram): Box[] {
  return [
    ...diagram.nodes.filter((n) => !isNodeHidden(diagram, n)).map((n) => ({ ...n.position, ...n.size })),
    ...diagram.groups.filter((g) => !isGroupFrameHidden(diagram, g)).map((g) => ({ ...g.position, width: g.size.width, height: Math.max(g.size.height, headerSize(g)) })),
  ]
}

const ceilTo = (v: number, grid: number) => (grid > 0 ? Math.ceil(v / grid) * grid : v)
const roundTo = (v: number, grid: number) => (grid > 0 ? Math.round(v / grid) * grid : v)

/**
 * Top-left for a block of `size` beside `anchor` (the selection's box): to
 * the right, centred on it, else below, stepping further out until nothing
 * visible is covered. Prefers right, then below, at each distance. On the grid.
 */
export function placeBeside(diagram: Diagram, anchor: Box, size: Size, grid = 0): Position {
  const obstacles = visibleObstacles(diagram)
  const free = (p: Position) => !obstacles.some((o) => overlaps({ ...p, ...size }, o, REFINE_MARGIN))
  const step = Math.max(REFINE_GAP / 2, grid)
  for (let k = 0; k < MAX_STEPS; k++) {
    const right = { x: ceilTo(anchor.x + anchor.width + REFINE_GAP + k * step, grid), y: roundTo(anchor.y + anchor.height / 2 - size.height / 2, grid) }
    if (free(right)) return right
    const below = { x: roundTo(anchor.x + anchor.width / 2 - size.width / 2, grid), y: ceilTo(anchor.y + anchor.height + REFINE_GAP + k * step, grid) }
    if (free(below)) return below
  }
  return placeInFreeSpace(diagram, size, { x: anchor.x + anchor.width / 2, y: anchor.y + anchor.height / 2 }, grid)
}

export interface RefinePlacement {
  nodes: DiagramNode[]
  /** Connectors between new shapes, then to existing ones. */
  edges: DiagramEdge[]
  /** Existing shapes the new connectors end on. */
  anchors: DiagramNode[]
  /** Connectors left out because their existing end is gone or hidden now. */
  droppedLinks: number
  /** The new shapes' box (null when no shapes are added). */
  bounds: Box | null
}

/**
 * Where a refinement goes in the diagram as it is now: beside the captured
 * selection (or, if it's all gone, the anchors). Pure: the preview and Add
 * to canvas both call it, so the preview shows where things will land.
 */
export function placeRefinement(diagram: Diagram, laid: RefineLaidOut, selectedIds: readonly string[], grid = 0): RefinePlacement {
  const byId = new Map(diagram.nodes.map((n) => [n.id, n]))
  const usable = (id: string) => {
    const n = byId.get(id)
    return n && !isNodeHidden(diagram, n) ? n : undefined
  }
  const fresh = new Set(laid.content.nodes.map((n) => n.id))
  const links = laid.links.filter((e) => (fresh.has(e.source) || usable(e.source)) && (fresh.has(e.target) || usable(e.target)))
  const anchorIds = new Set(links.flatMap((e) => [e.source, e.target]).filter((id) => !fresh.has(id)))
  const anchors = [...anchorIds].map((id) => byId.get(id)!)

  if (laid.content.nodes.length === 0) return { nodes: [], edges: links, anchors, droppedLinks: laid.links.length - links.length, bounds: null }

  const box = (nodes: DiagramNode[]) => unionBox(nodes.map((n) => ({ ...n.position, ...n.size })))
  const around = box(selectedIds.map(usable).filter((n): n is DiagramNode => Boolean(n))) ?? box(anchors)
  const size = fragmentBounds({ nodes: laid.content.nodes, edges: [], groups: [] })
  const corner = around ? placeBeside(diagram, around, size, grid) : placeInFreeSpace(diagram, size, { x: 0, y: 0 }, grid)
  const dx = corner.x - size.x
  const dy = corner.y - size.y
  const nodes = laid.content.nodes.map((n) => ({ ...n, position: { x: n.position.x + dx, y: n.position.y + dy } }))
  return {
    nodes,
    edges: [...laid.content.edges, ...links],
    anchors,
    droppedLinks: laid.links.length - links.length,
    bounds: { x: corner.x, y: corner.y, width: size.width, height: size.height },
  }
}

/**
 * The preview: the diagram after the chosen fixes, cut down to what changes:
 * the new items where they'll land, the existing shapes they connect to, and
 * the shapes and connectors the fixes touch. `context` lists the existing
 * shapes shown unchanged (to be drawn dimmed). A diagram of its own: no
 * layers, groups or locks from the real one.
 */
export function previewDiagram(diagram: Diagram, placement: RefinePlacement, fixes: readonly RefineFix[] = []): { diagram: Diagram; context: Set<string> } {
  const after = applyFixes(diagram, fixes).diagram
  const nodeIds = new Set(placement.anchors.map((n) => n.id))
  const changed = new Set<string>()
  for (const f of fixes) {
    if (f.action === 'remove') continue
    const edge = after.edges.find((e) => e.id === f.id)
    if (edge) [edge.source, edge.target].forEach((id) => nodeIds.add(id))
    else {
      nodeIds.add(f.id)
      changed.add(f.id)
    }
  }
  for (const f of fixes) {
    if (f.action !== 'remove') continue
    const edge = diagram.edges.find((e) => e.id === f.id)
    // Show both ends of a removed connector, so its absence reads.
    if (edge) [edge.source, edge.target].forEach((id) => nodeIds.add(id))
  }
  const existing = after.nodes.filter((n) => nodeIds.has(n.id)).map(({ groupId: _g, layerId: _l, ...n }) => ({ ...n, locked: false }))
  const shown = new Set([...existing.map((n) => n.id), ...placement.nodes.map((n) => n.id)])
  const edges = [
    ...after.edges.filter((e) => shown.has(e.source) && shown.has(e.target)).map(({ layerId: _l, ...e }) => e),
    ...placement.edges.filter((e) => shown.has(e.source) && shown.has(e.target)),
  ]
  const context = new Set(existing.map((n) => n.id).filter((id) => !changed.has(id)))
  return {
    diagram: DiagramSchema.parse({ ...createEmptyDiagram('Refine preview'), nodes: [...existing, ...placement.nodes], edges }),
    context,
  }
}
