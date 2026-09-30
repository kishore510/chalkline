import { DEFAULT_LAYER_ID, type Diagram, type DiagramEdge, type DiagramGroup, type DiagramLayer, type DiagramNode } from '@/schema/diagram'

/*
 * Derived layer state. Nothing here is stored on items: hidden and locked are
 * always worked out from the item's layer (and, for locks, its own flag and
 * group; see isNodeLocked in groups.ts).
 */

type Layered = { layerId?: string }

export const layerIdOf = (item: Layered): string => item.layerId ?? DEFAULT_LAYER_ID

/** Sets an item's layer; the default layer is stored as a missing layerId. */
export function withLayer<T extends Layered>(item: T, layerId: string | undefined): T {
  const { layerId: _old, ...rest } = item
  return (layerId === undefined || layerId === DEFAULT_LAYER_ID ? rest : { ...rest, layerId }) as T
}

export function getLayer(d: Diagram, id: string): DiagramLayer | undefined {
  return d.layers.find((l) => l.id === id)
}

export const isLayerHidden = (d: Diagram, id: string) => getLayer(d, id)?.visible === false
export const isLayerLocked = (d: Diagram, id: string) => getLayer(d, id)?.locked === true

/** Position in the stack, 0 at the bottom. */
export const layerIndex = (d: Diagram, id: string) => Math.max(0, d.layers.findIndex((l) => l.id === id))

export function isNodeHidden(d: Diagram, node: DiagramNode): boolean {
  return isLayerHidden(d, layerIdOf(node))
}

/** Hidden if its own layer is hidden, or either end is on a hidden layer. */
export function isEdgeHidden(d: Diagram, edge: DiagramEdge): boolean {
  if (isLayerHidden(d, layerIdOf(edge))) return true
  const source = d.nodes.find((n) => n.id === edge.source)
  const target = d.nodes.find((n) => n.id === edge.target)
  return Boolean((source && isNodeHidden(d, source)) || (target && isNodeHidden(d, target)))
}

/** Only the frame: members keep their own layers' visibility. */
export function isGroupFrameHidden(d: Diagram, group: DiagramGroup): boolean {
  return isLayerHidden(d, layerIdOf(group))
}

/** Edges have no lock flag of their own: locked only by their layer. */
export function isEdgeLocked(d: Diagram, edge: DiagramEdge): boolean {
  return isLayerLocked(d, layerIdOf(edge))
}

export const isLayerUsable = (d: Diagram, id: string) => {
  const layer = getLayer(d, id)
  return Boolean(layer && layer.visible && !layer.locked)
}

/** The closest layer (by stack position) that is visible and unlocked, or null. */
export function nearestUsableLayer(d: Diagram, from: string): string | null {
  const start = layerIndex(d, from)
  for (let distance = 0; distance < d.layers.length; distance++) {
    for (const i of [start + distance, start - distance]) {
      const layer = d.layers[i]
      if (layer && layer.visible && !layer.locked) return layer.id
    }
  }
  return null
}

/** Number of nodes, edges and groups on each layer. */
export function layerCounts(d: Diagram): Map<string, number> {
  const counts = new Map(d.layers.map((l) => [l.id, 0]))
  for (const item of [...d.nodes, ...d.edges, ...d.groups]) {
    const id = layerIdOf(item)
    counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  return counts
}

/* ---------- Edits (pure) ---------- */

const touchLayers = (d: Diagram, layers: DiagramLayer[]): Diagram => ({ ...d, layers })

export function addLayerOp(d: Diagram, id: string, name: string): Diagram {
  return touchLayers(d, [...d.layers, { id, name, visible: true, locked: false }])
}

export function renameLayerOp(d: Diagram, id: string, name: string): Diagram {
  const layer = getLayer(d, id)
  return !layer || layer.name === name ? d : touchLayers(d, d.layers.map((l) => (l.id === id ? { ...l, name } : l)))
}

/** Moves a layer one step up (+1, towards the top) or down (-1). */
export function moveLayerOp(d: Diagram, id: string, direction: -1 | 1): Diagram {
  const i = d.layers.findIndex((l) => l.id === id)
  const j = i + direction
  if (i < 0 || j < 0 || j >= d.layers.length) return d
  const layers = [...d.layers]
  ;[layers[i], layers[j]] = [layers[j]!, layers[i]!]
  return touchLayers(d, layers)
}

/** View state: visible / locked. */
export function setLayerViewOp(d: Diagram, id: string, patch: { visible?: boolean; locked?: boolean }): Diagram {
  const layer = getLayer(d, id)
  if (!layer) return d
  const next = { ...layer, ...patch }
  return next.visible === layer.visible && next.locked === layer.locked ? d : touchLayers(d, d.layers.map((l) => (l.id === id ? next : l)))
}

/** Puts items (nodes, edges, groups) on a layer. */
export function assignLayerOp(d: Diagram, ids: ReadonlySet<string>, layerId: string): Diagram {
  const move = <T extends { id: string; layerId?: string }>(items: T[]): T[] => {
    let changed = false
    const out = items.map((item) => {
      if (!ids.has(item.id) || layerIdOf(item) === layerId) return item
      changed = true
      return withLayer(item, layerId)
    })
    return changed ? out : items
  }
  const nodes = move(d.nodes)
  const edges = move(d.edges)
  const groups = move(d.groups)
  return nodes === d.nodes && edges === d.edges && groups === d.groups ? d : { ...d, nodes, edges, groups }
}

/** Items on a layer. */
export function itemsOnLayer(d: Diagram, layerId: string): Set<string> {
  return new Set([...d.nodes, ...d.edges, ...d.groups].filter((item) => layerIdOf(item) === layerId).map((item) => item.id))
}

/** Deletes a layer (never the default one), moving its items to `moveTo`. */
export function deleteLayerOp(d: Diagram, id: string, moveTo: string = DEFAULT_LAYER_ID): Diagram {
  if (id === DEFAULT_LAYER_ID || !getLayer(d, id) || moveTo === id || !getLayer(d, moveTo)) return d
  const moved = assignLayerOp(d, itemsOnLayer(d, id), moveTo)
  return touchLayers(moved, moved.layers.filter((l) => l.id !== id))
}

/**
 * Undo and redo restore whole documents, but layer visibility and locks are
 * view state: keep the current ones on the restored document.
 */
export function carryLayerView(restored: Diagram, current: Diagram): Diagram {
  let changed = false
  const layers = restored.layers.map((l) => {
    const now = getLayer(current, l.id)
    if (!now || (now.visible === l.visible && now.locked === l.locked)) return l
    changed = true
    return { ...l, visible: now.visible, locked: now.locked }
  })
  return changed ? { ...restored, layers } : restored
}
