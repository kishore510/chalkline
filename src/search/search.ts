import type { Diagram, DiagramNode } from '@/schema/diagram'
import { isNodeHidden, layerIdOf } from '@/store/layers'

/*
 * Find in the diagram: shape labels and notes, case- and accent-insensitive.
 * Pure. Each shape's searchable text is worked out once and cached by the
 * shape object, which only changes when the shape does, so a search after an
 * edit re-reads just the shapes that changed.
 */

/** Lower case, accents dropped, runs of white space as one space. */
export function normalise(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ')
}

interface Entry {
  label: string
  notes: string
}

const entries = new WeakMap<DiagramNode, Entry>()

function entryOf(node: DiagramNode): Entry {
  let entry = entries.get(node)
  if (!entry) entries.set(node, (entry = { label: normalise(node.label), notes: normalise(node.notes) }))
  return entry
}

export interface SearchHit {
  id: string
  /** Where it matched: the label wins if both do. */
  field: 'label' | 'notes'
  /** The outermost collapsed group hiding this shape, if any. */
  collapsedIn?: string
}

export interface SearchResult {
  /** Visible matches: label matches first, then notes, each top to bottom, left to right. */
  hits: SearchHit[]
  /** Matches on hidden layers (not in `hits`), and which layers they are on. */
  hidden: { count: number; layerIds: string[] }
}

export const EMPTY_RESULT: SearchResult = { hits: [], hidden: { count: 0, layerIds: [] } }

/** For each group, the outermost collapsed group around it (itself included), if any. */
function collapsedAround(d: Diagram): (groupId: string | undefined) => string | undefined {
  const byId = new Map(d.groups.map((g) => [g.id, g]))
  const memo = new Map<string, string | undefined>()
  const find = (id: string | undefined, seen = new Set<string>()): string | undefined => {
    if (id === undefined) return undefined
    if (memo.has(id)) return memo.get(id)
    const group = byId.get(id)
    if (!group || seen.has(id)) return undefined
    seen.add(id)
    const outer = find(group.parentId, seen)
    const result = outer ?? (group.collapsed ? id : undefined)
    memo.set(id, result)
    return result
  }
  return find
}

/** Searches shape labels and notes. An empty (or blank) query finds nothing. */
export function searchDiagram(d: Diagram, query: string): SearchResult {
  const q = normalise(query).trim()
  if (!q) return EMPTY_RESULT
  const collapsed = collapsedAround(d)
  const labelHits: { hit: SearchHit; node: DiagramNode }[] = []
  const notesHits: { hit: SearchHit; node: DiagramNode }[] = []
  const hiddenLayers = new Set<string>()
  let hiddenCount = 0
  for (const node of d.nodes) {
    const entry = entryOf(node)
    const field = entry.label.includes(q) ? 'label' : entry.notes.includes(q) ? 'notes' : null
    if (!field) continue
    if (isNodeHidden(d, node)) {
      hiddenCount++
      hiddenLayers.add(layerIdOf(node))
      continue
    }
    const collapsedIn = collapsed(node.groupId)
    const hit: SearchHit = { id: node.id, field, ...(collapsedIn && { collapsedIn }) }
    ;(field === 'label' ? labelHits : notesHits).push({ hit, node })
  }
  const order = (a: { node: DiagramNode }, b: { node: DiagramNode }) => a.node.position.y - b.node.position.y || a.node.position.x - b.node.position.x
  return {
    hits: [...labelHits.sort(order), ...notesHits.sort(order)].map((x) => x.hit),
    hidden: { count: hiddenCount, layerIds: [...hiddenLayers] },
  }
}

/** Wraps around both ways. */
export function stepIndex(current: number, count: number, direction: 1 | -1): number {
  if (count === 0) return -1
  if (current < 0) return direction === 1 ? 0 : count - 1
  return (current + direction + count) % count
}
