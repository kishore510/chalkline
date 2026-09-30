import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  MiniMap,
  ReactFlow,
  SelectionMode,
  type Connection,
  type EdgeChange,
  type IsValidConnection,
  type NodeChange,
  type OnConnectEnd,
} from '@xyflow/react'
import { useCallback, useEffect, useMemo } from 'react'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { MEDIA } from '@/styles/breakpoints'
import { resolveColour } from '@/lib/colour'
import { readToken } from '@/lib/cssVar'
import { cn } from '@/lib/utils'
import { useDiagramStore } from '@/store/diagramStore'
import { useUiStore } from '@/store/uiStore'
import {
  applySelection,
  createNodeMapper,
  summariseEdgeChanges,
  summariseNodeChanges,
  toFlowEdges,
  type ShapeFlowNode,
} from './flow'
import { FloatingEdge } from './FloatingEdge'
import { ShapeNode } from './ShapeNode'
import { useLongPress, type PressTarget } from './useLongPress'

const nodeTypes = { shape: ShapeNode }
const edgeTypes = { floating: FloatingEdge }
const isValidConnection: IsValidConnection = (c) => c.source !== c.target

const minimapColour = (node: ShapeFlowNode) => resolveColour(node.data.style.fill, 'var(--cl-border-strong)')

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
  const finePointer = useMediaQuery(MEDIA.finePointer)

  // Grid and minimap sizes come from tokens; read once on mount.
  const sizes = useMemo(
    () => ({
      grid: readToken('--cl-grid-gap', 20),
      edgeWidth: readToken('--cl-edge-width', 1.5),
      dot: readToken('--cl-grid-dot', 1),
      minimapWidth: readToken('--cl-minimap-width', 160),
      minimapHeight: readToken('--cl-minimap-height', 112),
    }),
    [],
  )

  const mapNodes = useMemo(() => createNodeMapper(), [])
  const selected = useMemo(() => new Set(selection), [selection])
  const selectTool = tool === 'select'
  const linkTool = tool === 'link'
  // Dragging from handles needs a precise pointer; touch uses Link mode instead.
  const connectable = selectTool && finePointer
  const nodes = useMemo(() => mapNodes(diagram, selected, selectTool), [mapNodes, diagram, selected, selectTool])
  const edges = useMemo(() => toFlowEdges(diagram, selected, sizes.edgeWidth), [diagram, selected, sizes.edgeWidth])

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

  // New connections float: they attach to the nearest sides, whichever handle was dragged.
  const onConnect = useCallback((c: Connection) => {
    const id = diagramStore().linkNodes(c.source, c.target)
    if (id) diagramStore().setSelection([id])
  }, [])

  // Dropping a connector on a node's body (not just a handle) connects it too.
  const onConnectEnd: OnConnectEnd = useCallback(
    (event, state) => {
      uiStore().setConnecting(false)
      if (state.isValid || !state.fromNode) return
      const point = 'changedTouches' in event ? event.changedTouches[0] : event
      if (!point) return
      const el = document.elementFromPoint(point.clientX, point.clientY)?.closest<HTMLElement>('.react-flow__node')
      const targetId = el?.dataset.id
      if (targetId && targetId !== state.fromNode.id) onConnect({ source: state.fromNode.id, target: targetId, sourceHandle: null, targetHandle: null })
    },
    [onConnect],
  )

  const longPress = useLongPress(openMenu)

  // iOS Safari ignores touch-action for page zoom; block its pinch gesture while the editor is open.
  useEffect(() => {
    const block = (e: Event) => e.preventDefault()
    document.addEventListener('gesturestart', block)
    return () => document.removeEventListener('gesturestart', block)
  }, [])

  return (
    <div className="absolute inset-0" {...longPress}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectStart={() => uiStore().setConnecting(true)}
        onConnectEnd={onConnectEnd}
        isValidConnection={isValidConnection}
        connectionMode={ConnectionMode.Loose}
        connectionRadius={32}
        onNodeClick={(_, node) => void uiStore().linkTap(node.id)}
        onNodeDoubleClick={(_, node) => selectTool && uiStore().setEditing(node.id)}
        onEdgeDoubleClick={(_, edge) => {
          diagramStore().setSelection([edge.id])
          uiStore().requestLabelFocus()
        }}
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
        onPaneClick={() => {
          uiStore().closeContextMenu()
          uiStore().clearLinkSource()
        }}
        onMoveStart={() => uiStore().closeContextMenu()}
        // Select: drag on empty canvas draws a selection box; middle/right mouse still pans.
        // Pan: any drag pans. Link: drag pans, taps on shapes connect them.
        panOnDrag={selectTool ? [1, 2] : true}
        selectionOnDrag={selectTool}
        selectionMode={SelectionMode.Partial}
        nodesDraggable={selectTool}
        nodesConnectable={connectable}
        elementsSelectable={!linkTool}
        // Tapping selects; starting a drag doesn't, so the phone sheet never pops up mid-drag.
        selectNodesOnDrag={false}
        panOnScroll
        zoomOnPinch
        zoomOnDoubleClick={false}
        minZoom={0.1}
        maxZoom={4}
        snapToGrid={snapToGrid}
        snapGrid={[sizes.grid, sizes.grid]}
        // Deleting goes through the store's deleteSelection (see useShortcuts), so one delete
        // is one undoable action; React Flow's own key handling splits nodes and edges.
        deleteKeyCode={null}
        attributionPosition="top-left"
        className={cn(connecting && 'cl-connecting', !connectable && 'cl-no-handles', tool === 'pan' && 'cl-tool-pan', linkTool && 'cl-tool-link')}
      >
        <Background variant={BackgroundVariant.Dots} gap={sizes.grid} size={sizes.dot} />
        {showMinimap && (
          <MiniMap
            position="top-right"
            pannable
            zoomable
            ariaLabel="Overview"
            nodeColor={minimapColour}
            style={{ width: sizes.minimapWidth, height: sizes.minimapHeight }}
          />
        )}
      </ReactFlow>
    </div>
  )
}
