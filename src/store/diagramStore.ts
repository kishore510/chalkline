import { create } from 'zustand'
import {
  createEmptyDiagram,
  DEFAULT_LAYER_ID,
  DiagramSchema,
  MAX_LAYERS,
  parseDiagram,
  type Diagram,
  type DiagramEdge,
  type DiagramNode,
  type EdgeStyle,
  type NodeStyle,
  type NodeType,
  type Orientation,
  type Position,
  type Size,
  type TextDefaults,
} from '@/schema/diagram'
import { align, distribute, matchSize, type AlignMode, type Axis, type MatchMode } from '@/canvas/arrange'
import { createId } from '@/lib/id'
import { createNode, MIN_NODE_SIZE } from '@/schema/factories'
import { getShape, isKnownShape } from '@/shapes/registry'
import { copyFragment, fragmentBounds, pasteFragment, type Fragment } from './clipboard'
import type { LayoutChanges } from '@/layout/computeLayout'
import { newConnectorStyle } from '@/settings/newDiagram'
import { placeStencil } from '@/stencils/fragment'
import type { StencilContent } from '@/stencils/format'
import * as groups from './groups'
import * as layers from './layers'
import * as ops from './ops'
import { placeInFreeSpace } from './placement'

/** Undo steps kept. */
export const HISTORY_LIMIT = 100
/** Changes with the same key within this window merge into one undo step (e.g. typing). */
const MERGE_WINDOW_MS = 1000
/** How far each paste or duplicate is nudged from the original. */
const PASTE_STEP = 24

export interface DiagramState {
  /** Always a valid Diagram, exactly in the schema's shape. */
  diagram: Diagram
  /** Selected node and edge ids (ids are unique across both). */
  selection: string[]

  /* History */
  past: Diagram[]
  future: Diagram[]
  canUndo: boolean
  canRedo: boolean
  undo: () => void
  redo: () => void
  /** Groups every change until endBatch into one undo step (a drag, a resize). */
  beginBatch: () => void
  endBatch: () => void

  /* Editing */
  /** Adds a node centred on `center`, on the active layer, and selects it. Returns its id, or null if the active layer is hidden or locked. */
  addNode: (type: NodeType, center: Position, grid?: number) => string | null
  moveNodes: (moves: ReadonlyMap<string, Position>) => void
  /**
   * An arrow-key nudge (planned and snapped by canvas/nudge): moves shapes and
   * containers, carrying a container's contents. Locked and hidden items stay.
   * Repeats on the same items in quick succession (a held key) are one undo step.
   */
  nudge: (moves: ReadonlyMap<string, Position>) => void
  resizeNode: (id: string, size: Size, position?: Position) => void
  /** Grows a node's height so its label fits; never shrinks. Joins the previous undo step. */
  growNodeToFit: (id: string, minHeight: number) => void
  setNodeLabel: (id: string, label: string) => void
  /** Changes nodes to another registry shape, keeping label, notes, style, size (grown to its minimum), connectors and group. Unknown ids and locked nodes are skipped. */
  changeNodeType: (ids: string[], type: string) => void
  setTitle: (title: string) => void
  /** Diagram-wide font and size for labels; a label's own values override them. One undo step. */
  setTextDefaults: (patch: ops.StylePatch<TextDefaults>) => void
  updateNodeStyles: (ids: string[], patch: ops.StylePatch<NodeStyle>) => void
  resetNodeStyles: (ids: string[]) => void
  setNodeNotes: (id: string, notes: string) => void
  /**
   * Accepted AI note suggestions: writes only these shapes' notes, as ONE undo
   * step (never merged with typing). Like typing a note, it works on locked
   * shapes. Returns how many shapes changed.
   */
  acceptSuggestedNotes: (changes: ReadonlyArray<{ id: string; notes: string }>) => number
  updateEdgeStyles: (ids: string[], patch: ops.StylePatch<EdgeStyle>) => void
  resetEdgeStyles: (ids: string[]) => void
  setEdgeLabel: (id: string, label: string) => void
  setEdgeNotes: (id: string, notes: string) => void
  /** Pins an edge end to a side, or returns it to auto with null. */
  setEdgeSides: (ids: string[], patch: ops.SidesPatch) => void
  resetEdgeSides: (ids: string[]) => void
  /** Moves an edge's ends to other nodes/sides. Returns false (and changes nothing) if rejected. */
  reconnectEdge: (id: string, reconnection: ops.Reconnection) => boolean
  connect: (connection: ops.Connection) => string | null
  /** Connects two nodes with a floating edge (no stored handles; it attaches to the nearest sides). */
  linkNodes: (source: string, target: string) => string | null

  /* Arranging (selected nodes only; edges and groups are ignored, locked nodes skipped). One undo step each. */
  alignSelection: (mode: AlignMode) => ArrangeResult
  /** Needs 3+ selected (unlocked) nodes. */
  distributeSelection: (axis: Axis) => ArrangeResult
  matchSizeSelection: (mode: MatchMode) => ArrangeResult

  /* Groups, pools and lanes. One undo step each. */
  /** Wraps the selected nodes (and containers) in a new container and selects it. Returns its id, or null if refused. */
  groupSelection: () => string | null
  /** Removes a group; everything inside stays in place. */
  ungroup: (id: string) => void
  /** Moves a group and everything inside it. */
  moveGroup: (id: string, to: Position) => void
  /** Resizes a group without touching members; never smaller than its contents. */
  resizeGroup: (id: string, box: { x: number; y: number; width: number; height: number }) => void
  /** After a drag: each node joins the innermost group under its centre, or leaves its group. */
  adoptDropped: (ids: string[]) => void
  /** Takes nodes out of their group (one level up), in place. */
  removeFromGroup: (ids: string[]) => void
  setCollapsed: (id: string, collapsed: boolean) => void
  /** Locks or unlocks nodes and/or groups. */
  setLocked: (ids: string[], locked: boolean) => void
  setGroupLabel: (id: string, label: string) => void
  /** Grows a group's header so its title fits. Joins the previous undo step. */
  growGroupHeader: (id: string, size: number) => void
  /** A pool with three lanes centred on `center`, on the active layer; selects it and returns its id (null if the active layer can't take it). */
  addPool: (center: Position, orientation: Orientation) => string | null
  addLane: (laneId: string, where: 'before' | 'after') => string | null
  /** Removes a lane; its members stay, now in the pool. */
  deleteLane: (laneId: string) => void
  moveLane: (laneId: string, direction: -1 | 1) => void
  setLaneThickness: (laneId: string, thickness: number) => void
  /** Deletes groups with everything inside them (members, nested groups, their connectors). */
  deleteGroupsWithContents: (ids: string[]) => void

  /* Auto-arrange and tidy. One undo step each. */
  /** Applies a computed layout (see computeLayout). Locked items never move. Returns true if anything changed. */
  applyLayout: (changes: LayoutChanges) => boolean
  /**
   * Auto ends already route to the nearest clear sides as you edit, so this
   * changes data only with `clearPinned`: pinned ends (of the selected
   * connectors, or all) go back to auto. Returns how many connectors changed.
   */
  tidyConnectors: (options: { clearPinned: boolean }) => { cleared: number; skipped: number }

  /* Deleting */
  /** What the most recent delete removed. `id` changes on every delete; `historySize` detects later edits. */
  lastDeletion: (ops.Removed & { id: number; historySize: number }) | null
  deleteElements: (ids: Iterable<string>) => void
  deleteSelection: () => void
  /** Puts back what the last delete removed and selects it. */
  restoreDeleted: () => void
  /** The toast's Undo: a plain undo if nothing changed since the delete, otherwise a restore. */
  undoDeletion: () => void
  dismissDeletion: () => void

  /* Clipboard */
  clipboard: Fragment | null
  /** Copies selected shapes and the connectors between them. Null if no shape is selected. */
  copySelection: () => Fragment | null
  cutSelection: () => void
  /** Pastes the clipboard (offset from the original, or centred on `at`) and selects it. */
  paste: (at?: Position) => string[]
  /** Puts a fragment (e.g. from the system clipboard) on the clipboard and pastes it. */
  pasteFrom: (fragment: Fragment, at?: Position) => string[]
  duplicateSelection: () => string[]

  /* Stencils */
  /**
   * Inserts stencil content centred on `center` (snapped to `grid`), on the
   * active layer, with fresh ids, and selects it. One undo step. Returns the
   * new ids, or null if the active layer is hidden or locked.
   */
  insertStencil: (content: StencilContent, center: Position, grid?: number) => string[] | null

  /* Generated diagrams (AI) */
  /**
   * Adds a generated, laid-out diagram (top-left at 0,0) in free space: beside
   * the existing content, nearer `viewCentre`, or centred on it when the
   * diagram is empty. Active layer, fresh ids, selected. One undo step; never
   * changes anything already there. Null if the active layer is hidden or locked.
   */
  insertGenerated: (content: StencilContent, viewCentre: Position, grid?: number) => string[] | null
  /**
   * Refine (AI): adds new, already placed shapes and connectors, some of
   * which may end on existing shapes. ADD-ONLY: nothing already there is
   * changed. Connectors go to existing shapes as manual connecting allows
   * (locked shapes included). Active layer, selected. One undo step. A
   * connector whose ends aren't a new shape plus a new or existing shape is
   * left out. Null if the active layer is hidden or locked.
   */
  insertRefinement: (nodes: readonly DiagramNode[], edges: readonly DiagramEdge[]) => { ids: string[]; dropped: number } | null

  /* Layers. Add, rename, reorder, delete and move-to-layer are undo steps; visibility and locks are view state (saved, not undoable). */
  /** Where new items go. Not part of the document. */
  activeLayerId: string
  setActiveLayer: (id: string) => void
  /** Why nothing can be added right now, if so. */
  activeLayerProblem: () => 'hidden' | 'locked' | null
  /** Adds a layer on top and makes it active. Null at the limit. */
  addLayer: (name?: string) => string | null
  renameLayer: (id: string, name: string) => void
  /** +1 moves a layer up the stack, -1 down. */
  moveLayer: (id: string, direction: -1 | 1) => void
  /** Deletes a layer (not the default one), moving its items to `moveTo` (default: Base). */
  deleteLayer: (id: string, moveTo?: string) => void
  /** Deletes a layer and everything on it, with an undo toast. */
  deleteLayerWithContents: (id: string) => void
  /** Returns the layer switched to if the active one became unusable (null if none was usable). */
  setLayerVisible: (id: string, visible: boolean) => { switchedTo?: string | null }
  setLayerLocked: (id: string, locked: boolean) => { switchedTo?: string | null }
  showAllLayers: () => void
  /** Shows only this layer (switching the active layer if it gets hidden). */
  soloLayer: (id: string) => { switchedTo?: string | null }
  /** Moves the selected items to a layer, one step. Locked items stay. */
  moveSelectionToLayer: (layerId: string) => { moved: number; skipped: number }

  setSelection: (ids: string[]) => void
  /** Replaces the document with untrusted input (migrated and validated). Throws if invalid. Undoable by default. */
  load: (raw: unknown, options?: { undoable?: boolean }) => void
  reset: () => void
}

/** How many selected nodes an arrange action left alone: locked, and on hidden layers. */
export interface ArrangeResult {
  skipped: number
  hidden: number
}

const sameIds = (a: string[], b: string[]) => a.length === b.length && a.every((id, i) => id === b[i])

interface CommitOptions {
  /** Changes with the same key in quick succession share one undo step. */
  key?: string
  /** Join the previous undo step (automatic follow-up changes). */
  merge?: boolean
  /** Other state to set alongside (always applied, even if the diagram didn't change). */
  extra?: Partial<DiagramState>
}

export const useDiagramStore = create<DiagramState>()((set, get) => {
  let lastKey: { key: string; at: number } | null = null
  let batchDepth = 0
  let batchRecorded = false
  let pasteCount = 0

  /** Applies a new diagram, recording an undo step unless merging. Returns true if it changed. */
  const commit = (next: Diagram, options: CommitOptions = {}): boolean => {
    const { diagram: current, past, future } = get()
    if (next === current) {
      if (options.extra) set(options.extra)
      return false
    }
    const now = Date.now()
    const coalesce = Boolean(options.key && lastKey?.key === options.key && now - lastKey.at < MERGE_WINDOW_MS)
    const inRecordedBatch = batchDepth > 0 && batchRecorded
    const record = !options.merge && !coalesce && !inRecordedBatch
    if (!options.merge) lastKey = options.key ? { key: options.key, at: now } : null
    if (record && batchDepth > 0) batchRecorded = true
    const nextPast = record ? [...past, current].slice(-HISTORY_LIMIT) : past
    const nextFuture = options.merge ? future : []
    set({
      diagram: ops.touch(next),
      past: nextPast,
      future: nextFuture,
      canUndo: nextPast.length > 0,
      canRedo: nextFuture.length > 0,
      ...options.extra,
    })
    return true
  }

  const apply = (op: (d: Diagram) => Diagram, options?: CommitOptions) => void commit(op(get().diagram), options)

  // Hidden items (and connectors to them) can't be selected.
  const pruneSelection = (diagram: Diagram, selection: string[]) => {
    const ids = new Set([
      ...diagram.nodes.filter((n) => !layers.isNodeHidden(diagram, n)).map((n) => n.id),
      ...diagram.edges.filter((e) => !layers.isEdgeHidden(diagram, e)).map((e) => e.id),
      ...diagram.groups.filter((g) => !layers.isGroupFrameHidden(diagram, g)).map((g) => g.id),
    ])
    const kept = selection.filter((id) => ids.has(id))
    return kept.length === selection.length ? selection : kept
  }

  const clearedHistory = { past: [], future: [], canUndo: false, canRedo: false }

  /** Selected nodes, split into those that may be arranged and those locked. */
  const selectedNodes = () => {
    const { diagram, selection } = get()
    const ids = new Set(selection)
    const nodes = diagram.nodes.filter((n) => ids.has(n.id))
    const visible = nodes.filter((n) => !layers.isNodeHidden(diagram, n))
    const free = visible.filter((n) => !groups.isNodeLocked(diagram, n))
    return { free, skipped: visible.length - free.length, hidden: nodes.length - visible.length }
  }

  const arrange = (make: (free: ReturnType<typeof selectedNodes>['free']) => Diagram): ArrangeResult => {
    const { free, skipped, hidden } = selectedNodes()
    commit(make(free))
    return { skipped, hidden }
  }

  // A group can't be moved, resized, deleted or regrouped when locked or on a locked layer.
  const groupLocked = (id: string) => {
    const d = get().diagram
    return groups.isGroupFixed(d, groups.groupById(d, id))
  }
  const edgeLocked = (id: string) => {
    const d = get().diagram
    const edge = d.edges.find((e) => e.id === id)
    return Boolean(edge && layers.isEdgeLocked(d, edge))
  }

  /** The active layer's id if things can be added to it, otherwise null. */
  const usableActive = () => {
    const { diagram, activeLayerId } = get()
    return layers.isLayerUsable(diagram, activeLayerId) ? activeLayerId : null
  }

  /** Commits a layer view change (visibility, lock): saved and autosaved, but not an undo step. */
  const commitView = (next: Diagram) => {
    const { diagram, selection, activeLayerId } = get()
    if (next === diagram) return {}
    set({ diagram: ops.touch(next), selection: pruneSelection(next, selection) })
    // If the active layer just became unusable, move to the nearest usable one.
    if (layers.isLayerUsable(next, activeLayerId)) return {}
    const switchedTo = layers.nearestUsableLayer(next, activeLayerId)
    if (switchedTo) set({ activeLayerId: switchedTo })
    return { switchedTo }
  }
  const nodeLocked = (id: string) => {
    const d = get().diagram
    const node = d.nodes.find((n) => n.id === id)
    return Boolean(node && groups.isNodeLocked(d, node))
  }

  /** Removes groups with everything inside; returns what went, for the undo toast. */
  const removeWithContents = (d: Diagram, ids: Iterable<string>) => {
    const groupIds = new Set<string>()
    for (const id of ids) if (groups.groupById(d, id)) for (const g of groups.subtreeIds(d, id)) groupIds.add(g)
    const members = groups.membersOf(d, groupIds).map((n) => n.id)
    const { diagram, removed } = ops.removeElements(d, members)
    const removedGroups = d.groups.filter((g) => groupIds.has(g.id))
    return { diagram: { ...diagram, groups: diagram.groups.filter((g) => !groupIds.has(g.id)) }, removed: { ...removed, groups: removedGroups } }
  }

  /**
   * Pastes a fragment. `layer`: 'active' puts everything on the active layer
   * (paste); 'keep' keeps each item's own layer unless that layer can't take
   * new items, then uses the active one (duplicate).
   */
  const pasteAt = (fragment: Fragment, at: Position | undefined, step: number, layer: 'active' | 'keep') => {
    const active = usableActive()
    if (!active) return []
    const bounds = fragmentBounds(fragment)
    const offset = at
      ? { x: at.x - (bounds.x + bounds.width / 2), y: at.y - (bounds.y + bounds.height / 2) }
      : { x: PASTE_STEP * step, y: PASTE_STEP * step }
    const current = get().diagram
    const place = <T extends { layerId?: string }>(item: T): T => {
      const own = layers.layerIdOf(item)
      return layers.withLayer(item, layer === 'keep' && layers.isLayerUsable(current, own) ? own : active)
    }
    const placed: Fragment = { nodes: fragment.nodes.map(place), edges: fragment.edges.map(place), groups: fragment.groups.map(place) }
    const { diagram, ids } = pasteFragment(current, placed, offset)
    commit(diagram, { extra: { selection: ids } })
    return ids
  }

  return {
    diagram: createEmptyDiagram(),
    selection: [],
    past: [],
    future: [],
    canUndo: false,
    canRedo: false,
    lastDeletion: null,
    clipboard: null,
    activeLayerId: DEFAULT_LAYER_ID,

    undo() {
      const { past, future, diagram, selection } = get()
      const previous = past.at(-1)
      if (!previous) return
      lastKey = null
      set({
        diagram: layers.carryLayerView(previous, diagram),
        past: past.slice(0, -1),
        future: [diagram, ...future],
        canUndo: past.length > 1,
        canRedo: true,
        selection: pruneSelection(layers.carryLayerView(previous, diagram), selection),
        lastDeletion: null,
      })
    },

    redo() {
      const { past, future, diagram, selection } = get()
      const [next, ...rest] = future
      if (!next) return
      lastKey = null
      set({
        diagram: layers.carryLayerView(next, diagram),
        past: [...past, diagram].slice(-HISTORY_LIMIT),
        future: rest,
        canUndo: true,
        canRedo: rest.length > 0,
        selection: pruneSelection(layers.carryLayerView(next, diagram), selection),
      })
    },

    beginBatch() {
      if (batchDepth === 0) {
        batchRecorded = false
        lastKey = null
      }
      batchDepth++
    },

    endBatch() {
      batchDepth = Math.max(0, batchDepth - 1)
    },

    addNode(type, center, grid = 0) {
      const active = usableActive()
      if (!active) return null
      const { diagram } = get()
      const node = layers.withLayer(createNode(type, ops.placeNode(diagram, center, getShape(type).defaultSize, grid)), active)
      commit(ops.addNode(diagram, node), { extra: { selection: [node.id] } })
      return node.id
    },

    // Locked nodes (or nodes in locked groups) never move or resize.
    moveNodes: (moves) => apply((d) => ops.moveNodes(d, new Map([...moves].filter(([id]) => !nodeLocked(id))))),
    nudge(moves) {
      const d = get().diagram
      let next = d
      const carried = new Set<string>()
      for (const [id, to] of moves) {
        const group = groups.groupById(d, id)
        if (!group || group.kind !== 'container' || groups.isGroupFixed(d, group)) continue
        next = groups.moveGroupTo(next, id, to)
        for (const sub of groups.subtreeIds(d, id)) carried.add(sub)
      }
      const nodeMoves = new Map(
        [...moves].filter(([id]) => {
          const node = d.nodes.find((n) => n.id === id)
          return node && !groups.isNodeLocked(d, node) && !layers.isNodeHidden(d, node) && !carried.has(node.groupId ?? '')
        }),
      )
      commit(ops.moveNodes(next, nodeMoves), { key: `nudge:${[...moves.keys()].sort().join()}` })
    },
    resizeNode: (id, size, position) => {
      if (nodeLocked(id)) return
      const node = get().diagram.nodes.find((n) => n.id === id)
      const min = node ? getShape(node.type).minSize : { width: MIN_NODE_SIZE, height: MIN_NODE_SIZE }
      apply((d) => ops.resizeNode(d, id, size, position, min))
    },
    growNodeToFit: (id, minHeight) => apply((d) => ops.growNodeHeight(d, id, minHeight), { merge: true }),
    changeNodeType(ids, type) {
      if (!isKnownShape(type)) return
      apply((d) => ops.changeNodeType(d, ids.filter((id) => !nodeLocked(id)), type, getShape(type).minSize))
    },
    setNodeLabel: (id, label) => apply((d) => ops.setNodeLabel(d, id, label), { key: `label:${id}` }),
    setTitle: (title) => apply((d) => ops.setTitle(d, title), { key: 'title' }),
    setTextDefaults: (patch) => apply((d) => ops.setTextDefaults(d, patch)),
    updateNodeStyles: (ids, patch) =>
      apply((d) => ops.updateNodeStyles(d, ids, patch), { key: `node-style:${ids.join()}:${Object.keys(patch).join()}` }),
    resetNodeStyles: (ids) => apply((d) => ops.resetNodeStyles(d, ids)),
    setNodeNotes: (id, notes) => apply((d) => ops.setNodeNotes(d, id, notes), { key: `notes:${id}` }),
    acceptSuggestedNotes(changes) {
      const before = get().diagram
      const next = ops.setNotesOf(before, new Map(changes.map((c) => [c.id, c.notes])))
      commit(next)
      return next.nodes.filter((n, i) => n !== before.nodes[i]).length
    },
    updateEdgeStyles: (ids, patch) =>
      apply((d) => ops.updateEdgeStyles(d, ids, patch), { key: `edge-style:${ids.join()}:${Object.keys(patch).join()}` }),
    resetEdgeStyles: (ids) => apply((d) => ops.resetEdgeStyles(d, ids)),
    setEdgeLabel: (id, label) => apply((d) => ops.setEdgeLabel(d, id, label), { key: `edge-label:${id}` }),
    setEdgeNotes: (id, notes) => apply((d) => ops.setEdgeNotes(d, id, notes), { key: `edge-notes:${id}` }),
    // Connectors on locked layers can't be reconnected.
    setEdgeSides: (ids, patch) => apply((d) => ops.setEdgeSides(d, ids.filter((id) => !edgeLocked(id)), patch)),
    resetEdgeSides: (ids) => apply((d) => ops.resetEdgeSides(d, ids.filter((id) => !edgeLocked(id)))),

    reconnectEdge(id, reconnection) {
      if (edgeLocked(id)) return false
      const { diagram, ok } = ops.reconnectEdge(get().diagram, id, reconnection)
      commit(diagram)
      return ok
    },

    connect(connection) {
      const active = usableActive()
      if (!active) return null
      const { diagram, edgeId } = ops.connect(get().diagram, connection, undefined, newConnectorStyle())
      if (!edgeId) return null
      commit(layers.assignLayerOp(diagram, new Set([edgeId]), active))
      return edgeId
    },

    linkNodes: (source, target) => get().connect({ source, target }),

    alignSelection: (mode) => arrange((free) => ops.arrangeNodes(get().diagram, align(free, mode))),
    distributeSelection: (axis) => arrange((free) => ops.arrangeNodes(get().diagram, distribute(free, axis))),
    matchSizeSelection: (mode) => arrange((free) => ops.arrangeNodes(get().diagram, new Map(), matchSize(free, mode))),

    groupSelection() {
      const active = usableActive()
      if (!active) return null
      const id = createId('g_')
      const d = get().diagram
      // Locked items (or ones on locked layers) can't be regrouped.
      const free = get().selection.filter((s) => !nodeLocked(s) && !groupLocked(s))
      const next = groups.groupItems(d, free, id)
      if (!next) return null
      commit(layers.assignLayerOp(next, new Set([id]), active), { extra: { selection: [id] } })
      return id
    },
    ungroup(id) {
      if (!groupLocked(id)) apply((d) => groups.ungroupGroup(d, id))
    },
    moveGroup(id, to) {
      if (!groupLocked(id)) apply((d) => groups.moveGroupTo(d, id, to))
    },
    resizeGroup(id, box) {
      if (!groupLocked(id)) apply((d) => groups.resizeGroupTo(d, id, box))
    },
    adoptDropped: (ids) => apply((d) => groups.adoptByPosition(d, ids)),
    removeFromGroup: (ids) => apply((d) => groups.removeFromGroup(d, ids)),
    setCollapsed: (id, collapsed) => apply((d) => groups.setGroupCollapsed(d, id, collapsed)),
    setLocked: (ids, locked) => apply((d) => groups.setItemsLocked(d, ids, locked)),
    setGroupLabel: (id, label) => apply((d) => groups.setGroupLabel(d, id, label), { key: `group-label:${id}` }),
    growGroupHeader: (id, size) => apply((d) => groups.growGroupHeader(d, id, size), { merge: true }),
    addPool(center, orientation) {
      const active = usableActive()
      if (!active) return null
      const pool = createId('g_')
      const lanes = [createId('g_'), createId('g_'), createId('g_')]
      const created = groups.createPool(get().diagram, center, orientation, { pool, lanes })
      commit(layers.assignLayerOp(created, new Set([pool, ...lanes]), active), { extra: { selection: [pool] } })
      return pool
    },
    addLane(laneId, where) {
      if (groupLocked(laneId)) return null
      const id = createId('g_')
      const d = get().diagram
      const lane = groups.groupById(d, laneId)
      // A new lane joins its pool's layer.
      const inserted = layers.assignLayerOp(groups.insertLane(d, laneId, where, id), new Set([id]), lane ? layers.layerIdOf(lane) : DEFAULT_LAYER_ID)
      return commit(inserted, { extra: { selection: [id] } }) ? id : null
    },
    deleteLane(laneId) {
      if (!groupLocked(laneId)) apply((d) => groups.removeLane(d, laneId))
    },
    moveLane(laneId, direction) {
      if (!groupLocked(laneId)) apply((d) => groups.reorderLane(d, laneId, direction))
    },
    setLaneThickness(laneId, thickness) {
      if (!groupLocked(laneId)) apply((d) => groups.setLaneThickness(d, laneId, thickness), { key: `lane-thickness:${laneId}` })
    },
    applyLayout({ nodes, groups: boxes, groupMoves }) {
      const current = get().diagram
      let next = current
      for (const [id, to] of groupMoves) {
        if (!groups.isGroupFixed(next, groups.groupById(next, id))) next = groups.moveGroupTo(next, id, to)
      }
      // Locked and hidden shapes never move.
      const moves = new Map([...nodes].filter(([id]) => {
        const node = next.nodes.find((n) => n.id === id)
        return node && !groups.isNodeLocked(next, node) && !layers.isNodeHidden(next, node)
      }))
      next = ops.arrangeNodes(next, moves)
      next = {
        ...next,
        groups: next.groups.map((g) => {
          const box = boxes.get(g.id)
          if (!box || groups.isGroupFixed(next, g) || g.kind !== 'container') return g
          return { ...g, position: { x: box.x, y: box.y }, size: { width: box.width, height: box.height } }
        }),
      }
      return commit(next)
    },

    tidyConnectors({ clearPinned }) {
      if (!clearPinned) return { cleared: 0, skipped: 0 }
      const { diagram, selection } = get()
      const selected = new Set(selection)
      const scope = diagram.edges.filter((e) => selected.size === 0 || selected.has(e.id))
      const pinned = scope.filter((e) => e.sourceHandle !== undefined || e.targetHandle !== undefined)
      // Hidden and locked connectors are left alone.
      const clearable = pinned.filter((e) => !layers.isEdgeHidden(diagram, e) && !layers.isEdgeLocked(diagram, e)).map((e) => e.id)
      const skipped = pinned.length - clearable.length
      if (clearable.length === 0) return { cleared: 0, skipped }
      commit(ops.resetEdgeSides(diagram, clearable))
      return { cleared: clearable.length, skipped }
    },

    deleteGroupsWithContents(ids) {
      const { diagram, selection, lastDeletion } = get()
      const unlocked = ids.filter((id) => !groups.isGroupFixed(diagram, groups.groupById(diagram, id)))
      const { diagram: next, removed } = removeWithContents(diagram, unlocked)
      if (!commit(next, { extra: { selection: pruneSelection(next, selection) } })) return
      set({ lastDeletion: { ...removed, id: (lastDeletion?.id ?? 0) + 1, historySize: get().past.length } })
    },

    // Deleting a group ungroups it (members survive); locked items are left alone.
    deleteElements(ids) {
      const { diagram, selection, lastDeletion } = get()
      const wanted = [...ids]
      const groupIds = new Set(diagram.groups.map((g) => g.id))
      let next = diagram
      for (const id of wanted) {
        if (groupIds.has(id) && !groups.isGroupFixed(next, groups.groupById(next, id))) next = groups.ungroupGroup(next, id)
      }
      const removable = wanted.filter((id) => !groupIds.has(id) && !nodeLocked(id) && !edgeLocked(id))
      const { diagram: after, removed } = ops.removeElements(next, removable)
      if (!commit(after, { extra: { selection: pruneSelection(after, selection) } })) return
      if (removed.nodes.length + removed.edges.length > 0) {
        set({ lastDeletion: { ...removed, id: (lastDeletion?.id ?? 0) + 1, historySize: get().past.length } })
      }
    },

    deleteSelection: () => get().deleteElements(get().selection),

    restoreDeleted() {
      const { diagram, lastDeletion } = get()
      if (!lastDeletion) return
      const { diagram: next, restored } = ops.restoreElements(diagram, lastDeletion)
      commit(next, { extra: { selection: restored, lastDeletion: null } })
    },

    undoDeletion() {
      const { lastDeletion, past } = get()
      if (!lastDeletion) return
      if (past.length === lastDeletion.historySize) {
        const removedIds = [...lastDeletion.nodes, ...lastDeletion.edges].map((item) => item.id)
        get().undo()
        get().setSelection(removedIds)
      } else {
        get().restoreDeleted()
      }
    },

    dismissDeletion: () => set({ lastDeletion: null }),

    copySelection() {
      const fragment = copyFragment(get().diagram, get().selection)
      if (fragment) {
        pasteCount = 0
        set({ clipboard: fragment })
      }
      return fragment
    },

    cutSelection() {
      if (get().copySelection()) get().deleteSelection()
    },

    paste(at) {
      const { clipboard } = get()
      if (!clipboard) return []
      pasteCount++
      return pasteAt(clipboard, at, pasteCount, 'active')
    },

    pasteFrom(fragment, at) {
      pasteCount = 0
      set({ clipboard: fragment })
      return get().paste(at)
    },

    duplicateSelection() {
      const fragment = copyFragment(get().diagram, get().selection)
      return fragment ? pasteAt(fragment, undefined, 1, 'keep') : []
    },

    insertStencil(content, center, grid = 0) {
      const active = usableActive()
      if (!active) return null
      const { diagram, ids } = placeStencil(get().diagram, content, center, active, grid)
      commit(diagram, { extra: { selection: ids } })
      return ids
    },

    insertGenerated(content, viewCentre, grid = 0) {
      const active = usableActive()
      if (!active) return null
      const current = get().diagram
      const bounds = fragmentBounds(content)
      const corner = placeInFreeSpace(current, bounds, viewCentre, grid)
      const centre = { x: corner.x + bounds.width / 2, y: corner.y + bounds.height / 2 }
      const { diagram, ids } = placeStencil(current, content, centre, active)
      commit(diagram, { extra: { selection: ids } })
      return ids
    },

    insertRefinement(newNodes, newEdges) {
      const active = usableActive()
      if (!active) return null
      const current = get().diagram
      const existing = new Set(current.nodes.map((n) => n.id))
      const taken = new Set([...existing, ...current.edges.map((e) => e.id), ...current.groups.map((g) => g.id)])
      const nodes = newNodes.filter((n) => !taken.has(n.id)).map(({ groupId: _group, ...n }) => layers.withLayer({ ...n, locked: false }, active))
      const fresh = new Set(nodes.map((n) => n.id))
      const ok = (id: string) => fresh.has(id) || existing.has(id)
      const edges = newEdges
        .filter((e) => !taken.has(e.id) && e.source !== e.target && ok(e.source) && ok(e.target) && (fresh.has(e.source) || fresh.has(e.target)))
        .map((e) => layers.withLayer(e, active))
      const ids = [...nodes.map((n) => n.id), ...edges.map((e) => e.id)]
      if (ids.length > 0) commit({ ...current, nodes: [...current.nodes, ...nodes], edges: [...current.edges, ...edges] }, { extra: { selection: ids } })
      return { ids, dropped: newEdges.length - edges.length }
    },

    setActiveLayer(id) {
      if (layers.getLayer(get().diagram, id)) set({ activeLayerId: id })
    },
    activeLayerProblem() {
      const { diagram, activeLayerId } = get()
      const layer = layers.getLayer(diagram, activeLayerId)
      return !layer ? 'hidden' : !layer.visible ? 'hidden' : layer.locked ? 'locked' : null
    },
    addLayer(name) {
      const d = get().diagram
      if (d.layers.length >= MAX_LAYERS) return null
      const id = createId('l_')
      commit(layers.addLayerOp(d, id, name?.trim() || `Layer ${d.layers.length + 1}`), { extra: { activeLayerId: id } })
      return id
    },
    renameLayer: (id, name) => apply((d) => layers.renameLayerOp(d, id, name), { key: `layer-name:${id}` }),
    moveLayer: (id, direction) => apply((d) => layers.moveLayerOp(d, id, direction)),
    deleteLayer(id, moveTo = DEFAULT_LAYER_ID) {
      const next = layers.deleteLayerOp(get().diagram, id, moveTo)
      if (!commit(next, { extra: { selection: pruneSelection(next, get().selection) } })) return
      if (get().activeLayerId === id) set({ activeLayerId: layers.isLayerUsable(next, moveTo) ? moveTo : (layers.nearestUsableLayer(next, moveTo) ?? DEFAULT_LAYER_ID) })
    },
    deleteLayerWithContents(id) {
      const d = get().diagram
      if (id === DEFAULT_LAYER_ID || !layers.getLayer(d, id)) return
      const on = layers.itemsOnLayer(d, id)
      // Group frames on the layer go (their members on other layers stay, released), then everything else on it.
      let next = d
      for (const g of d.groups) if (on.has(g.id) && next.groups.some((x) => x.id === g.id)) next = groups.ungroupGroup(next, g.id)
      const { diagram: removedItems, removed } = ops.removeElements(next, [...on])
      const without = { ...removedItems, layers: removedItems.layers.filter((l) => l.id !== id) }
      const lastDeletion = get().lastDeletion
      if (!commit(without, { extra: { selection: pruneSelection(without, get().selection) } })) return
      const frames = d.groups.filter((g) => on.has(g.id))
      set({ lastDeletion: { ...removed, groups: frames, id: (lastDeletion?.id ?? 0) + 1, historySize: get().past.length } })
      if (get().activeLayerId === id) set({ activeLayerId: layers.nearestUsableLayer(without, DEFAULT_LAYER_ID) ?? DEFAULT_LAYER_ID })
    },
    setLayerVisible: (id, visible) => commitView(layers.setLayerViewOp(get().diagram, id, { visible })),
    setLayerLocked: (id, locked) => commitView(layers.setLayerViewOp(get().diagram, id, { locked })),
    showAllLayers() {
      let d = get().diagram
      for (const l of d.layers) d = layers.setLayerViewOp(d, l.id, { visible: true })
      commitView(d)
    },
    soloLayer(id) {
      let d = get().diagram
      for (const l of d.layers) d = layers.setLayerViewOp(d, l.id, { visible: l.id === id })
      return commitView(d)
    },
    moveSelectionToLayer(layerId) {
      const d = get().diagram
      if (!layers.getLayer(d, layerId)) return { moved: 0, skipped: 0 }
      const selected = get().selection
      const free = selected.filter((id) => !nodeLocked(id) && !edgeLocked(id) && !groupLocked(id))
      const next = layers.assignLayerOp(d, new Set(free), layerId)
      commit(next, { extra: { selection: pruneSelection(next, selected) } })
      return { moved: free.length, skipped: selected.length - free.length }
    },

    setSelection(ids) {
      const next = pruneSelection(get().diagram, [...new Set(ids)])
      if (!sameIds(next, get().selection)) set({ selection: next })
    },

    load(raw, { undoable = true } = {}) {
      const diagram = parseDiagram(raw)
      const { diagram: current, past } = get()
      lastKey = null
      const history = undoable
        ? { past: [...past, current].slice(-HISTORY_LIMIT), future: [], canUndo: true, canRedo: false }
        : clearedHistory
      const activeLayerId = layers.isLayerUsable(diagram, DEFAULT_LAYER_ID) ? DEFAULT_LAYER_ID : (layers.nearestUsableLayer(diagram, DEFAULT_LAYER_ID) ?? DEFAULT_LAYER_ID)
      set({ diagram, selection: [], lastDeletion: null, activeLayerId, ...history })
    },

    reset: () => set({ diagram: createEmptyDiagram(), selection: [], lastDeletion: null, activeLayerId: DEFAULT_LAYER_ID, ...clearedHistory }),
  }
})

// Development safety net: shout as soon as the store ever holds an invalid document.
if (import.meta.env?.DEV) {
  useDiagramStore.subscribe(({ diagram }, previous) => {
    if (diagram === previous.diagram) return
    const result = DiagramSchema.safeParse(diagram)
    if (!result.success) console.error('Diagram store left the schema', result.error.issues)
  })
}
