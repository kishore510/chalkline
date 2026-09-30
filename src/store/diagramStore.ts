import { create } from 'zustand'
import { createEmptyDiagram, DiagramSchema, parseDiagram, type Diagram, type NodeType, type Position, type Size } from '@/schema/diagram'
import { createNode, DEFAULT_NODE_SIZE, MIN_NODE_SIZE } from '@/schema/factories'
import * as ops from './ops'

export interface DiagramState {
  /** Always a valid Diagram, exactly in the schema's shape. */
  diagram: Diagram
  /** Selected node and edge ids (ids are unique across both). */
  selection: string[]

  /** Adds a node centred on `center` and selects it. Returns its id. */
  addNode: (type: NodeType, center: Position, grid?: number) => string
  moveNodes: (moves: ReadonlyMap<string, Position>) => void
  resizeNode: (id: string, size: Size, position?: Position) => void
  setNodeLabel: (id: string, label: string) => void
  setTitle: (title: string) => void
  connect: (connection: ops.Connection) => string | null
  deleteElements: (ids: Iterable<string>) => void
  deleteSelection: () => void
  setSelection: (ids: string[]) => void
  /** Replaces the document with untrusted input (migrated and validated). Throws if invalid. */
  load: (raw: unknown) => void
  reset: () => void
}

const sameIds = (a: string[], b: string[]) => a.length === b.length && a.every((id, i) => id === b[i])

export const useDiagramStore = create<DiagramState>()((set, get) => {
  // Applies an operation; only stamps `updated` and notifies when something changed.
  const apply = (op: (d: Diagram) => Diagram) => {
    const current = get().diagram
    const next = op(current)
    if (next !== current) set({ diagram: ops.touch(next) })
  }

  const pruneSelection = (diagram: Diagram, selection: string[]) => {
    const ids = new Set([...diagram.nodes.map((n) => n.id), ...diagram.edges.map((e) => e.id)])
    const kept = selection.filter((id) => ids.has(id))
    return kept.length === selection.length ? selection : kept
  }

  return {
    diagram: createEmptyDiagram(),
    selection: [],

    addNode(type, center, grid = 0) {
      const { diagram } = get()
      const size = DEFAULT_NODE_SIZE[type]
      const node = createNode(type, ops.placeNode(diagram, center, size, grid))
      set({ diagram: ops.touch(ops.addNode(diagram, node)), selection: [node.id] })
      return node.id
    },

    moveNodes: (moves) => apply((d) => ops.moveNodes(d, moves)),
    resizeNode: (id, size, position) => apply((d) => ops.resizeNode(d, id, size, position, MIN_NODE_SIZE)),
    setNodeLabel: (id, label) => apply((d) => ops.setNodeLabel(d, id, label)),
    setTitle: (title) => apply((d) => ops.setTitle(d, title)),

    connect(connection) {
      const { diagram, edgeId } = ops.connect(get().diagram, connection)
      if (edgeId) set({ diagram: ops.touch(diagram) })
      return edgeId
    },

    deleteElements(ids) {
      const { diagram, selection } = get()
      const next = ops.deleteElements(diagram, ids)
      if (next === diagram) return
      set({ diagram: ops.touch(next), selection: pruneSelection(next, selection) })
    },

    deleteSelection: () => get().deleteElements(get().selection),

    setSelection(ids) {
      const next = pruneSelection(get().diagram, [...new Set(ids)])
      if (!sameIds(next, get().selection)) set({ selection: next })
    },

    load(raw) {
      set({ diagram: parseDiagram(raw), selection: [] })
    },

    reset: () => set({ diagram: createEmptyDiagram(), selection: [] }),
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
