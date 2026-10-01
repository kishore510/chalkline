import type { Diagram } from '@/schema/diagram'
import { isEdgeHidden, isGroupFrameHidden, isNodeHidden } from '@/store/layers'

/*
 * What an AI action sends about a diagram: compact JSON with only what a
 * model needs to understand it. Ids, labels, shape ids, connections, groups,
 * and (when asked for) notes and rounded positions. Never styling, fonts,
 * layers, timestamps or images. Pure and deterministic, so the size shown
 * before sending is the size sent.
 */

export interface PayloadOptions {
  /** Only these items (shapes, connectors, groups). Missing means the whole diagram. */
  ids?: Iterable<string>
  /** Include shape and connector notes. */
  includeNotes: boolean
  /** Include rounded positions and sizes (off unless an action needs layout). */
  includePositions?: boolean
  /** Include items on hidden layers (off: hidden usually means "not for now"). */
  includeHidden?: boolean
}

interface Box {
  x: number
  y: number
  w: number
  h: number
}

export interface PayloadNode extends Partial<Box> {
  id: string
  shape: string
  label?: string
  notes?: string
  group?: string
}

export interface PayloadEdge {
  id: string
  from: string
  to: string
  label?: string
  notes?: string
}

export interface PayloadGroup extends Partial<Box> {
  id: string
  kind: 'container' | 'lane'
  label?: string
  parent?: string
}

export interface DiagramPayload {
  title: string
  nodes: PayloadNode[]
  edges: PayloadEdge[]
  groups?: PayloadGroup[]
}

export interface PayloadCounts {
  nodes: number
  edges: number
  groups: number
  /** Notes included. */
  notes: number
  /** Notes on the included items that were left out (notes off). */
  notesLeftOut: number
}

export interface BuiltPayload {
  payload: DiagramPayload
  /** Exactly what is sent: no indentation. */
  json: string
  counts: PayloadCounts
}

const box = (item: { position: { x: number; y: number }; size: { width: number; height: number } }): Box => ({
  x: Math.round(item.position.x),
  y: Math.round(item.position.y),
  w: Math.round(item.size.width),
  h: Math.round(item.size.height),
})

const text = (value: string) => (value.trim() ? value : undefined)

/**
 * The diagram, or the chosen items, as compact JSON. A subset includes the
 * chosen shapes and groups, every shape inside a chosen group, and the
 * connectors whose two ends are both included.
 */
export function buildPayload(diagram: Diagram, options: PayloadOptions): BuiltPayload {
  const { includeNotes, includePositions = false, includeHidden = false } = options
  const chosen = options.ids ? new Set(options.ids) : null

  // Groups chosen directly, plus everything nested inside them.
  const groupIds = new Set<string>()
  if (chosen) {
    for (const g of diagram.groups) if (chosen.has(g.id)) groupIds.add(g.id)
    let grew = true
    while (grew) {
      grew = false
      for (const g of diagram.groups) {
        if (!groupIds.has(g.id) && g.parentId && groupIds.has(g.parentId)) {
          groupIds.add(g.id)
          grew = true
        }
      }
    }
  }

  const groups = diagram.groups.filter((g) => (!chosen || groupIds.has(g.id)) && (includeHidden || !isGroupFrameHidden(diagram, g)))
  const nodes = diagram.nodes.filter((n) => (!chosen || chosen.has(n.id) || (n.groupId !== undefined && groupIds.has(n.groupId))) && (includeHidden || !isNodeHidden(diagram, n)))
  const ends = new Set([...nodes.map((n) => n.id), ...groups.map((g) => g.id)])
  const edges = diagram.edges.filter((e) => ends.has(e.source) && ends.has(e.target) && (includeHidden || !isEdgeHidden(diagram, e)))
  const sentGroups = new Set(groups.map((g) => g.id))

  let notes = 0
  let notesLeftOut = 0
  const noteOf = (value: string) => {
    if (!value.trim()) return undefined
    if (!includeNotes) {
      notesLeftOut++
      return undefined
    }
    notes++
    return value
  }

  const payload: DiagramPayload = {
    title: diagram.meta.title,
    nodes: nodes.map((n) => ({
      id: n.id,
      shape: n.type,
      label: text(n.label),
      notes: noteOf(n.notes),
      group: n.groupId !== undefined && sentGroups.has(n.groupId) ? n.groupId : undefined,
      ...(includePositions && box(n)),
    })),
    edges: edges.map((e) => ({ id: e.id, from: e.source, to: e.target, label: text(e.label ?? ''), notes: noteOf(e.notes) })),
  }
  if (groups.length > 0) {
    payload.groups = groups.map((g) => ({
      id: g.id,
      kind: g.kind,
      label: text(g.label),
      parent: g.parentId !== undefined && sentGroups.has(g.parentId) ? g.parentId : undefined,
      ...(includePositions && box(g)),
    }))
  }

  // JSON.stringify drops the undefined fields, so absent things cost nothing.
  return {
    payload,
    json: JSON.stringify(payload),
    counts: { nodes: nodes.length, edges: edges.length, groups: groups.length, notes, notesLeftOut },
  }
}
