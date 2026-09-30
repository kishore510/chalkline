import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  MiniMap,
  ReactFlow,
  SelectionMode,
  useReactFlow,
  type Connection,
  type EdgeChange,
  type IsValidConnection,
  type NodeChange,
  type OnConnectEnd,
} from '@xyflow/react'
import { useCallback, useEffect, useMemo } from 'react'
import { readToken } from '@/lib/cssVar'
import { cn } from '@/lib/utils'
import { useDiagramStore } from '@/store/diagramStore'
import { useUiStore } from '@/store/uiStore'
import {
  applySelection,
  createNodeMapper,
  nearestSide,
  summariseEdgeChanges,
  summariseNodeChanges,
  toFlowEdges,
  type ShapeFlowNode,
} from './flow'
import { ShapeNode } from './ShapeNode'
import { useLongPress, type PressTarget } from './useLongPress'

const nodeTypes = { shape: ShapeNode }
const isValidConnection: IsValidConnection = (c) => c.source !== c.target

const diagramStore = () => useDiagramStore.getState()
const uiStore = () => useUiStore.getState()

function select(id: string) {
  if (!diagramStore().selection.includes(id)) diagramStore().setSelection([id])
}

function openMenu(target: PressTarget, x: number, y: number) {
  select(target.id)
  uiStore().openContextMenu({ ...target, x, y })
}

export function Canvas({ showMinimap }: { showMinimap: boolean }) {
  const diagram = useDiagramStore((s) => s.diagram)
  const selection = useDiagramStore((s) => s.selection)
  const tool = useUiStore((s) => s.tool)
  const snapToGrid = useUiStore((s) => s.snapToGrid)
  const connecting = useUiStore((s) => s.connecting)
  const { screenToFlowPosition } = useReactFlow()

  // Grid and minimap sizes come from tokens; read once on mount.
  const sizes = useMemo(
    () => ({
      grid: readToken('--cl-grid-gap', 20),
      dot: readToken('--cl-grid-dot', 1),
      minimapWidth: readToken('--cl-minimap-width', 160),
      minimapHeight: readToken('--cl-minimap-height', 112),
    }),
    [],
  )

  const mapNodes = useMemo(() => createNodeMapper(), [])
  const selected = useMemo(() => new Set(selection), [selection])
  const nodes = useMemo(() => mapNodes(diagram, selected, tool === 'select'), [mapNodes, diagram, selected, tool])
  const edges = useMemo(() => toFlowEdges(diagram, selected), [diagram, selected])

  const onNodesChange = useCallback((changes: NodeChange<ShapeFlowNode>[]) => {
    const { moves, resizes, removed, selection: flags } = summariseNodeChanges(changes)
    if (moves.size) diagramStore().moveNodes(moves)
    for (const r of resizes) diagramStore().resizeNode(r.id, r.size, r.position)
    if (removed.length) diagramStore().deleteElements(removed)
    if (flags.size) diagramStore().setSelection(applySelection(diagramStore().selection, flags))
  }, [])

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    const { removed, selection: flags } = summariseEdgeChanges(changes)
    if (removed.length) diagramStore().deleteElements(removed)
    if (flags.size) diagramStore().setSelection(applySelection(diagramStore().selection, flags))
  }, [])

  const onConnect = useCallback((c: Connection) => {
    const id = diagramStore().connect(c)
    if (id) diagramStore().setSelection([id])
  }, [])

  // Dropping a connector on a node's body (not just a handle) connects to its nearest side.
  // Much easier to hit with a finger than a handle.
  const onConnectEnd: OnConnectEnd = useCallback(
    (event, state) => {
      uiStore().setConnecting(false)
      if (state.isValid || !state.fromNode) return
      const point = 'changedTouches' in event ? event.changedTouches[0] : event
      if (!point) return
      const el = document.elementFromPoint(point.clientX, point.clientY)?.closest<HTMLElement>('.react-flow__node')
      const targetId = el?.dataset.id
      const target = diagramStore().diagram.nodes.find((n) => n.id === targetId)
      if (!target || target.id === state.fromNode.id) return
      const side = nearestSide({ ...target.position, ...target.size }, screenToFlowPosition({ x: point.clientX, y: point.clientY }))
      onConnect({ source: state.fromNode.id, sourceHandle: state.fromHandle?.id ?? null, target: target.id, targetHandle: side })
    },
    [onConnect, screenToFlowPosition],
  )

  const longPress = useLongPress(openMenu)

  // iOS Safari ignores touch-action for page zoom; block its pinch gesture while the editor is open.
  useEffect(() => {
    const block = (e: Event) => e.preventDefault()
    document.addEventListener('gesturestart', block)
    return () => document.removeEventListener('gesturestart', block)
  }, [])

  const selectTool = tool === 'select'

  return (
    <div className="absolute inset-0" {...longPress}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectStart={() => uiStore().setConnecting(true)}
        onConnectEnd={onConnectEnd}
        isValidConnection={isValidConnection}
        connectionMode={ConnectionMode.Loose}
        connectionRadius={32}
        onNodeDoubleClick={(_, node) => uiStore().setEditing(node.id)}
        onNodeDragStart={() => uiStore().closeContextMenu()}
        onNodeContextMenu={(e, node) => {
          e.preventDefault()
          openMenu({ id: node.id, kind: 'node' }, e.clientX, e.clientY)
        }}
        onEdgeContextMenu={(e, edge) => {
          e.preventDefault()
          openMenu({ id: edge.id, kind: 'edge' }, e.clientX, e.clientY)
        }}
        onPaneContextMenu={(e) => e.preventDefault()}
        onPaneClick={() => uiStore().closeContextMenu()}
        onMoveStart={() => uiStore().closeContextMenu()}
        // Select tool: drag on empty canvas draws a selection box; middle/right mouse still pans.
        // Pan tool: any drag pans and shapes can't be moved or connected.
        panOnDrag={selectTool ? [1, 2] : true}
        selectionOnDrag={selectTool}
        selectionMode={SelectionMode.Partial}
        nodesDraggable={selectTool}
        nodesConnectable={selectTool}
        elementsSelectable
        panOnScroll
        zoomOnPinch
        zoomOnDoubleClick={false}
        minZoom={0.1}
        maxZoom={4}
        snapToGrid={snapToGrid}
        snapGrid={[sizes.grid, sizes.grid]}
        deleteKeyCode={['Delete', 'Backspace']}
        attributionPosition="top-left"
        className={cn(connecting && 'cl-connecting', !selectTool && 'cl-tool-pan')}
      >
        <Background variant={BackgroundVariant.Dots} gap={sizes.grid} size={sizes.dot} />
        {showMinimap && (
          <MiniMap
            position="top-right"
            pannable
            zoomable
            ariaLabel="Overview"
            style={{ width: sizes.minimapWidth, height: sizes.minimapHeight }}
          />
        )}
      </ReactFlow>
    </div>
  )
}
