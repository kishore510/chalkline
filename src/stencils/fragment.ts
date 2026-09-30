import type { Diagram, Position } from '@/schema/diagram'
import { snapPosition } from '@/store/ops'
import { copyFragment, fragmentBounds, pasteFragment } from '@/store/clipboard'
import { withLayer } from '@/store/layers'
import { MAX_STENCIL_NODES, stripPlacement, type StencilContent } from './format'

/*
 * Turning a selection into stencil content, and stencil content back into
 * diagram items. Pure: the store and library call these.
 */

export type ExtractResult =
  | { ok: true; content: StencilContent }
  | { ok: false; reason: 'nothing' | 'lane-only' | 'too-many' }

export const EXTRACT_MESSAGES: Record<Exclude<ExtractResult, { ok: true }>['reason'], string> = {
  nothing: 'Select one or more shapes or groups to save as a stencil.',
  'lane-only': 'A lane can’t be saved on its own. Select its pool to save the whole swimlane.',
  'too-many': `A stencil can hold at most ${MAX_STENCIL_NODES} shapes.`,
}

/**
 * Stencil content from selected nodes and groups. A group brings its members
 * and nested groups (a pool brings its lanes); a lane selected on its own is
 * refused. Only connectors with both ends included are kept. Positions are
 * moved so the top-left of the bounding box is 0,0; layers and locks are
 * dropped; everything else (labels, notes, styles, sizes, shape ids, group
 * structure, pinned sides) is kept.
 */
export function extractStencilContent(diagram: Diagram, ids: Iterable<string>): ExtractResult {
  const selected = new Set(ids)
  const groups = diagram.groups.filter((g) => selected.has(g.id))
  const nodes = diagram.nodes.filter((n) => selected.has(n.id))
  if (nodes.length === 0 && groups.length > 0 && groups.every((g) => g.kind === 'lane')) return { ok: false, reason: 'lane-only' }

  const fragment = copyFragment(diagram, selected)
  if (!fragment) return { ok: false, reason: 'nothing' }
  if (fragment.nodes.length > MAX_STENCIL_NODES) return { ok: false, reason: 'too-many' }

  // Links to groups outside the stencil are cut.
  const kept = new Set(fragment.groups.map((g) => g.id))
  const bounds = fragmentBounds(fragment)
  const shift = (p: Position) => ({ x: p.x - bounds.x, y: p.y - bounds.y })
  const content = stripPlacement({
    nodes: fragment.nodes.map(({ groupId, ...n }) => ({ ...n, position: shift(n.position), ...(groupId && kept.has(groupId) && { groupId }) })),
    edges: fragment.edges,
    groups: fragment.groups.map(({ parentId, ...g }) => ({ ...g, position: shift(g.position), ...(parentId && kept.has(parentId) && { parentId }) })),
  })
  return { ok: true, content }
}

/**
 * Adds stencil content to a diagram, centred on `center` (top-left snapped to
 * `grid` when set), on `layerId`, unlocked, with fresh ids and remapped
 * connector ends, group memberships and nesting. Returns the new ids.
 */
export function placeStencil(diagram: Diagram, content: StencilContent, center: Position, layerId: string, grid = 0): { diagram: Diagram; ids: string[] } {
  const bounds = fragmentBounds(content)
  const corner = { x: center.x - bounds.width / 2, y: center.y - bounds.height / 2 }
  const topLeft = grid > 0 ? snapPosition(corner, grid) : corner
  const offset = { x: topLeft.x - bounds.x, y: topLeft.y - bounds.y }
  const placed = {
    nodes: content.nodes.map((n) => withLayer({ ...n, locked: false }, layerId)),
    edges: content.edges.map((e) => withLayer(e, layerId)),
    groups: content.groups.map((g) => withLayer({ ...g, locked: false }, layerId)),
  }
  return pasteFragment(diagram, placed, offset)
}
