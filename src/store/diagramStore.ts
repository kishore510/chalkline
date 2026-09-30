import { create } from 'zustand'
import {
  createEmptyDiagram,
  DiagramSchema,
  parseDiagram,
  type Diagram,
  type EdgeStyle,
  type NodeStyle,
  type NodeType,
  type Position,
  type Size,
} from '@/schema/diagram'
import { createNode, DEFAULT_NODE_SIZE, MIN_NODE_SIZE } from '@/schema/factories'
import { copyFragment, fragmentBounds, pasteFragment, type Fragment } from './clipboard'
import * as ops from './ops'

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
  /** Adds a node centred on `center` and selects it. Returns its id. */
  addNode: (type: NodeType, center: Position, grid?: number) => string
  moveNodes: (moves: ReadonlyMap<string, Position>) => void
  resizeNode: (id: string, size: Size, position?: Position) => void
  /** Grows a node's height so its label fits; never shrinks. Joins the previous undo step. */
  growNodeToFit: (id: string, minHeight: number) => void
  setNodeLabel: (id: string, label: string) => void
  setTitle: (title: string) => void
  updateNodeStyles: (ids: string[], patch: ops.StylePatch<NodeStyle>) => void
  resetNodeStyles: (ids: string[]) => void
  setNodeNotes: (id: string, notes: string) => void
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

  setSelection: (ids: string[]) => void
  /** Replaces the document with untrusted input (migrated and validated). Throws if invalid. Undoable by default. */
  load: (raw: unknown, options?: { undoable?: boolean }) => void
  reset: () => void
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

  const pruneSelection = (diagram: Diagram, selection: string[]) => {
    const ids = new Set([...diagram.nodes.map((n) => n.id), ...diagram.edges.map((e) => e.id)])
    const kept = selection.filter((id) => ids.has(id))
    return kept.length === selection.length ? selection : kept
  }

  const clearedHistory = { past: [], future: [], canUndo: false, canRedo: false }

  const pasteAt = (fragment: Fragment, at: Position | undefined, step: number) => {
    const bounds = fragmentBounds(fragment)
    const offset = at
      ? { x: at.x - (bounds.x + bounds.width / 2), y: at.y - (bounds.y + bounds.height / 2) }
      : { x: PASTE_STEP * step, y: PASTE_STEP * step }
    const { diagram, ids } = pasteFragment(get().diagram, fragment, offset)
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

    undo() {
      const { past, future, diagram, selection } = get()
      const previous = past.at(-1)
      if (!previous) return
      lastKey = null
      set({
        diagram: previous,
        past: past.slice(0, -1),
        future: [diagram, ...future],
        canUndo: past.length > 1,
        canRedo: true,
        selection: pruneSelection(previous, selection),
        lastDeletion: null,
      })
    },

    redo() {
      const { past, future, diagram, selection } = get()
      const [next, ...rest] = future
      if (!next) return
      lastKey = null
      set({
        diagram: next,
        past: [...past, diagram].slice(-HISTORY_LIMIT),
        future: rest,
        canUndo: true,
        canRedo: rest.length > 0,
        selection: pruneSelection(next, selection),
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
      const { diagram } = get()
      const node = createNode(type, ops.placeNode(diagram, center, DEFAULT_NODE_SIZE[type], grid))
      commit(ops.addNode(diagram, node), { extra: { selection: [node.id] } })
      return node.id
    },

    moveNodes: (moves) => apply((d) => ops.moveNodes(d, moves)),
    resizeNode: (id, size, position) => apply((d) => ops.resizeNode(d, id, size, position, MIN_NODE_SIZE)),
    growNodeToFit: (id, minHeight) => apply((d) => ops.growNodeHeight(d, id, minHeight), { merge: true }),
    setNodeLabel: (id, label) => apply((d) => ops.setNodeLabel(d, id, label), { key: `label:${id}` }),
    setTitle: (title) => apply((d) => ops.setTitle(d, title), { key: 'title' }),
    updateNodeStyles: (ids, patch) =>
      apply((d) => ops.updateNodeStyles(d, ids, patch), { key: `node-style:${ids.join()}:${Object.keys(patch).join()}` }),
    resetNodeStyles: (ids) => apply((d) => ops.resetNodeStyles(d, ids)),
    setNodeNotes: (id, notes) => apply((d) => ops.setNodeNotes(d, id, notes), { key: `notes:${id}` }),
    updateEdgeStyles: (ids, patch) =>
      apply((d) => ops.updateEdgeStyles(d, ids, patch), { key: `edge-style:${ids.join()}:${Object.keys(patch).join()}` }),
    resetEdgeStyles: (ids) => apply((d) => ops.resetEdgeStyles(d, ids)),
    setEdgeLabel: (id, label) => apply((d) => ops.setEdgeLabel(d, id, label), { key: `edge-label:${id}` }),
    setEdgeNotes: (id, notes) => apply((d) => ops.setEdgeNotes(d, id, notes), { key: `edge-notes:${id}` }),
    setEdgeSides: (ids, patch) => apply((d) => ops.setEdgeSides(d, ids, patch)),
    resetEdgeSides: (ids) => apply((d) => ops.resetEdgeSides(d, ids)),

    reconnectEdge(id, reconnection) {
      const { diagram, ok } = ops.reconnectEdge(get().diagram, id, reconnection)
      commit(diagram)
      return ok
    },

    connect(connection) {
      const { diagram, edgeId } = ops.connect(get().diagram, connection)
      if (edgeId) commit(diagram)
      return edgeId
    },

    linkNodes: (source, target) => get().connect({ source, target }),

    deleteElements(ids) {
      const { diagram, selection, lastDeletion } = get()
      const { diagram: next, removed } = ops.removeElements(diagram, ids)
      if (!commit(next, { extra: { selection: pruneSelection(next, selection) } })) return
      set({ lastDeletion: { ...removed, id: (lastDeletion?.id ?? 0) + 1, historySize: get().past.length } })
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
      return pasteAt(clipboard, at, pasteCount)
    },

    pasteFrom(fragment, at) {
      pasteCount = 0
      set({ clipboard: fragment })
      return get().paste(at)
    },

    duplicateSelection() {
      const fragment = copyFragment(get().diagram, get().selection)
      return fragment ? pasteAt(fragment, undefined, 1) : []
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
      set({ diagram, selection: [], lastDeletion: null, ...history })
    },

    reset: () => set({ diagram: createEmptyDiagram(), selection: [], lastDeletion: null, ...clearedHistory }),
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
