import { computeLayout, type ElkLike } from '@/layout/computeLayout'
import { presetToken } from '@/lib/colour'
import { createId } from '@/lib/id'
import { createEmptyDiagram, DiagramSchema, GroupSchema, type Diagram, type DiagramEdge, type DiagramGroup, type DiagramNode, type EdgeStyle } from '@/schema/diagram'
import { createEdge, createNode } from '@/schema/factories'
import { getShape } from '@/shapes/registry'
import type { StencilContent } from '@/stencils/format'
import { fragmentBounds } from '@/store/clipboard'
import type { GeneratedDiagram, GeneratedEdge } from './generated'

/*
 * A checked generated diagram as real diagram items, laid out by the same
 * ELK auto-arrange as Tidy, on the generated items alone (they're in a
 * diagram of their own here, so nothing on the canvas is involved). The
 * result has its top-left at 0,0 and no layers: it's placed and put on a
 * layer when added, like a stencil.
 */

type Arrowhead = NonNullable<EdgeStyle['endArrow']>

export interface LayoutOptions {
  /** Snap to this grid (0: no snapping). */
  grid: number
  /** The arrowhead new connectors get (the "default arrow" setting). */
  arrowhead: Arrowhead
}

export interface LaidOut {
  /** Items to add, top-left at 0,0. */
  content: StencilContent
  /** The same items as a diagram of their own, for the preview. */
  preview: Diagram
}

/** Connector style for a generated edge. The default arrow follows the setting; "none" has no arrowheads. */
export function edgeStyleFor(edge: Pick<GeneratedEdge, 'direction' | 'style'>, arrowhead: Arrowhead): EdgeStyle {
  const style: EdgeStyle = {}
  const head = arrowhead === 'none' ? 'arrow' : arrowhead
  if (edge.direction === 'forward' && arrowhead !== 'arrow') style.endArrow = arrowhead
  if (edge.direction === 'both') Object.assign(style, { startArrow: head, endArrow: head })
  if (edge.direction === 'none') style.endArrow = 'none'
  if (edge.style === 'dashed') style.dashed = true
  return style
}

/** Diagram items for a generated diagram, all at 0,0 (layout comes next). */
export function generatedItems(generated: GeneratedDiagram, arrowhead: Arrowhead): Pick<Diagram, 'nodes' | 'edges' | 'groups'> {
  const ids = new Map<string, string>()
  const nodes: DiagramNode[] = generated.nodes.map((n) => {
    const style = n.color ? { fill: presetToken(n.color, 'soft'), stroke: presetToken(n.color, 'strong') } : { ...getShape(n.shape).defaultStyle }
    const node = createNode(n.shape, { x: 0, y: 0 }, { label: n.label, notes: n.note ?? '', style })
    ids.set(n.id, node.id)
    return node
  })
  const groups: DiagramGroup[] = generated.groups.map((g) => {
    const group = GroupSchema.parse({ id: createId('g_'), label: g.title, kind: 'container', position: { x: 0, y: 0 }, size: { width: 1, height: 1 } })
    for (const member of g.members) {
      const node = nodes.find((n) => n.id === ids.get(member))
      if (node) node.groupId = group.id
    }
    return group
  })
  const edges: DiagramEdge[] = generated.edges.map((e) =>
    createEdge(ids.get(e.from)!, ids.get(e.to)!, { label: e.label ?? '', style: edgeStyleFor(e, arrowhead) }),
  )
  return { nodes, edges, groups }
}

export type LayoutOutcome = { ok: true; value: LaidOut } | { ok: false; message: string }

/** Lays the generated items out left to right with ELK and moves them to 0,0. */
export async function layoutGenerated(generated: GeneratedDiagram, elk: ElkLike, { grid, arrowhead }: LayoutOptions): Promise<LayoutOutcome> {
  const items = generatedItems(generated, arrowhead)
  const scratch: Diagram = { ...createEmptyDiagram('Generated diagram'), ...items }
  const result = await computeLayout(scratch, { direction: 'right', spacing: 'normal', grid }, elk)
  if (!result.ok) return { ok: false, message: result.message }

  const placed = {
    nodes: items.nodes.map((n) => ({ ...n, position: result.nodes.get(n.id) ?? n.position })),
    groups: items.groups.map((g) => {
      const box = result.groups.get(g.id)
      return box ? { ...g, position: { x: box.x, y: box.y }, size: { width: box.width, height: box.height } } : g
    }),
    edges: items.edges,
  }
  // Top-left to 0,0 (by whole grid steps, so the snapping holds).
  const bounds = fragmentBounds(placed)
  const step = (v: number) => (grid > 0 ? Math.floor(v / grid) * grid : v)
  const dx = step(bounds.x)
  const dy = step(bounds.y)
  const move = <T extends { position: { x: number; y: number } }>(item: T): T => ({ ...item, position: { x: item.position.x - dx, y: item.position.y - dy } })
  const content: StencilContent = { nodes: placed.nodes.map(move), edges: placed.edges, groups: placed.groups.map(move) }

  const preview = DiagramSchema.parse({ ...createEmptyDiagram('Generated diagram'), ...content })
  return { ok: true, value: { content, preview } }
}
