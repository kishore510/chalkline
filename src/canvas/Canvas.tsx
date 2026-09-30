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
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { MEDIA } from '@/styles/breakpoints'
import { resolveColour } from '@/lib/colour'
import { readToken } from '@/lib/cssVar'
import { cn } from '@/lib/utils'
import { useDiagramStore } from '@/store/diagramStore'
import { innermostGroupAt, isNodeLocked, subtreeIds } from '@/store/groups'
import { useUiStore } from '@/store/uiStore'
import {
  applySelection,
  createEdgeMapper,
  createNodeMapper,
  summariseEdgeChanges,
  summariseNodeChanges,
  type ShapeFlowNode,
} from './flow'
import { EdgeGrips } from './EdgeGrips'
import { FloatingEdge } from './FloatingEdge'
import { GroupNode, type GroupFlowNode } from './GroupNode'
import { buildRenderModel } from './renderModel'
import { createRouteCache } from './routing'
import { ShapeNode } from './ShapeNode'
import { spreadAttachments, type Spread } from './spread'
import { useLongPress, type PressTarget } from './useLongPress'

const nodeTypes = { shape: ShapeNode, 'group-box': GroupNode }
type CanvasNode = ShapeFlowNode | GroupFlowNode

// Groups sit behind edges and nodes; deeper groups above their parents.
const GROUP_Z = -1000
const edgeTypes = { floating: FloatingEdge }
const isValidConnection: IsValidConnection = (c) => c.source !== c.target

const minimapColour = (node: CanvasNode) =>
  node.type === 'group-box' ? 'var(--cl-group-border)' : resolveColour(node.data.style.fill, 'var(--cl-border-strong)')

const diagramStore = () => useDiagramStore.getState()
/** Shift, Cmd or Ctrl adds to the selection instead of replacing it. */
const isAdditive = (e: React.MouseEvent) => e.shiftKey || e.metaKey || e.ctrlKey
const uiStore = () => useUiStore.getState()

function select(id: string) {
  if (!diagramStore().selection.includes(id)) diagramStore().setSelection([id])
}

function openMenu(target: PressTarget, x: number, y: number) {
  if (target.kind !== 'pane') select(target.id)
  const isGroup = target.kind === 'node' && diagramStore().diagram.groups.some((g) => g.id === target.id)
  uiStore().openContextMenu({ ...target, kind: isGroup ? 'group' : target.kind, x, y })
}

/** While shapes are dragged, highlight the group they'd join if dropped now. */
function showDropTarget(dragged: CanvasNode[], main: CanvasNode) {
  const shapes = dragged.filter((n) => n.type === 'shape')
  const node = shapes.find((n) => n.id === main.id) ?? shapes[0]
  if (!node || uiStore().tool !== 'select') return uiStore().setDropTarget(null)
  const centre = { x: node.position.x + (node.width ?? 0) / 2, y: node.position.y + (node.height ?? 0) / 2 }
  uiStore().setDropTarget(innermostGroupAt(diagramStore().diagram, centre)?.id ?? null)
}

// A drag or selection drag is one undo step.
const beginBatch = () => {
  uiStore().closeContextMenu()
  diagramStore().beginBatch()
}
const endBatch = () => diagramStore().endBatch()

/** End of a node drag: shapes join (or leave) the group under their centre, in the same undo step. */
function endNodeDrag(dragged: CanvasNode[]) {
  const shapes = dragged.filter((n) => n.type === 'shape').map((n) => n.id)
  if (shapes.length && uiStore().tool === 'select') diagramStore().adoptDropped(shapes)
  uiStore().setDropTarget(null)
  endBatch()
}

/** `minimap`: where the overview sits, or 'none' (phone). Desktop keeps the top clear for the arrange bar. */
export function Canvas({ minimap }: { minimap: 'none' | 'top-right' | 'bottom-right' }) {
  const diagram = useDiagramStore((s) => s.diagram)
  const selection = useDiagramStore((s) => s.selection)
  const tool = useUiStore((s) => s.tool)
  const snapToGrid = useUiStore((s) => s.snapToGrid)
  const connecting = useUiStore((s) => s.connecting)
  const dropTarget = useUiStore((s) => s.dropTargetId)
  const animating = useUiStore((s) => s.animating)
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
  // What's drawn: collapsed groups hide their members, and connectors end on the group instead.
  const model = useMemo(() => buildRenderModel(diagram), [diagram])
  const shapeNodes = useMemo(() => {
    const visible = diagram.nodes.filter((n) => !model.hiddenNodes.has(n.id))
    const locked = new Set(visible.filter((n) => isNodeLocked(diagram, n)).map((n) => n.id))
    return mapNodes(visible, selected, selectTool, locked)
  }, [mapNodes, diagram, model, selected, selectTool])
  const groupNodes = useMemo(
    () =>
      model.groups.map(
        (view): GroupFlowNode => ({
          id: view.group.id,
          type: 'group-box',
          position: { x: view.box.x, y: view.box.y },
          width: view.box.width,
          height: view.box.height,
          measured: { width: view.box.width, height: view.box.height },
          zIndex: GROUP_Z + view.depth,
          // Selected through the header (see GroupNode), never by box-select or body clicks.
          selectable: false,
          connectable: false,
          focusable: false,
          // Lanes move only with their pool (and reorder via move up/down).
          draggable: selectTool && !view.locked && view.group.kind === 'container',
          dragHandle: '.cl-group-drag',
          data: { view, selected: selected.has(view.group.id), dropTarget: dropTarget === view.group.id },
        }),
      ),
    [model, selected, dropTarget, selectTool],
  )
  // Parents before children: groups (already ordered) first, then shapes.
  const nodes = useMemo<CanvasNode[]>(() => [...groupNodes, ...shapeNodes], [groupNodes, shapeNodes])
  // Routes are recomputed only for edges a change can affect (see createRouteCache).
  // Expanded groups aren't obstacles; nodes inside them still are.
  const route = useMemo(() => createRouteCache(), [])
  const mapEdges = useMemo(() => createEdgeMapper(), [])
  const routes = useMemo(() => route({ nodes: model.routingNodes, edges: model.edges }), [route, model])
  // Connectors sharing a side are spread along it (draw time only; reuses unchanged results).
  const lastSpread = useRef<Map<string, Spread>>(undefined)
  const spreads = useMemo(() => {
    const next = spreadAttachments(model.routingNodes, model.edges, routes, lastSpread.current)
    lastSpread.current = next
    return next
  }, [model, routes])
  const edges = useMemo(() => mapEdges(model.edges, selected, routes, sizes.edgeWidth, spreads), [mapEdges, model, selected, routes, sizes.edgeWidth, spreads])

  const onNodesChange = useCallback((changes: NodeChange<CanvasNode>[]) => {
    const { moves, resizes, removed, selection: flags } = summariseNodeChanges(changes)
    const d = diagramStore().diagram
    const groupIds = new Set(d.groups.map((g) => g.id))
    // Groups move first, taking everything inside; members dragged along too aren't moved twice.
    const movedWithGroup = new Set<string>()
    for (const [id, to] of moves) {
      if (!groupIds.has(id)) continue
      diagramStore().moveGroup(id, to)
      for (const sub of subtreeIds(d, id)) movedWithGroup.add(sub)
    }
    const nodeMoves = new Map(
      [...moves].filter(([id]) => !groupIds.has(id) && !movedWithGroup.has(d.nodes.find((n) => n.id === id)?.groupId ?? '')),
    )
    if (nodeMoves.size) diagramStore().moveNodes(nodeMoves)
    for (const r of resizes) {
      const group = d.groups.find((g) => g.id === r.id)
      if (group) diagramStore().resizeGroup(r.id, { ...(r.position ?? group.position), ...r.size })
      else diagramStore().resizeNode(r.id, r.size, r.position)
    }
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
        // In Link mode shapes (including ones inside groups) can be linked; groups ignore taps.
        // In Select mode a plain click selects just that shape: React Flow doesn't know about
        // group selection (made through the header), so without this a group stayed selected.
        onNodeClick={(e, node) => {
          if (node.type !== 'shape') return
          if (uiStore().tool === 'link') return void uiStore().linkTap(node.id)
          if (uiStore().tool === 'select' && !isAdditive(e)) diagramStore().setSelection([node.id])
        }}
        onEdgeClick={(e, edge) => {
          if (uiStore().tool === 'select' && !isAdditive(e)) diagramStore().setSelection([edge.id])
        }}
        onNodeDoubleClick={(_, node) => selectTool && node.type === 'shape' && uiStore().setEditing(node.id)}
        onEdgeDoubleClick={(_, edge) => {
          diagramStore().setSelection([edge.id])
          uiStore().requestLabelFocus()
        }}
        onNodeDragStart={beginBatch}
        onNodeDrag={(_, node, dragged) => showDropTarget(dragged, node)}
        onNodeDragStop={(_, __, dragged) => endNodeDrag(dragged)}
        // A fresh box-select starts from nothing (groups and lanes included); Shift/Cmd/Ctrl adds.
        onSelectionStart={(e) => {
          if (!isAdditive(e)) diagramStore().setSelection([])
        }}
        onSelectionDragStart={beginBatch}
        onSelectionDrag={(_, dragged) => dragged[0] && showDropTarget(dragged, dragged[0])}
        onSelectionDragStop={(_, dragged) => endNodeDrag(dragged)}
        onNodeContextMenu={(e, node) => {
          e.preventDefault()
          openMenu({ id: node.id, kind: 'node' }, e.clientX, e.clientY)
        }}
        onEdgeContextMenu={(e, edge) => {
          e.preventDefault()
          openMenu({ id: edge.id, kind: 'edge' }, e.clientX, e.clientY)
        }}
        onPaneContextMenu={(e) => {
          e.preventDefault()
          openMenu({ id: '', kind: 'pane' }, e.clientX, e.clientY)
        }}
        // Clicking empty canvas clears everything, groups included, and drops keyboard focus.
        onPaneClick={() => {
          uiStore().closeContextMenu()
          uiStore().clearLinkSource()
          diagramStore().setSelection([])
          if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
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
        // Frame a restored or opened diagram when the canvas first appears.
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1.5 }}
        className={cn(animating && 'cl-animating', connecting && 'cl-connecting', !connectable && 'cl-no-handles', tool === 'pan' && 'cl-tool-pan', linkTool && 'cl-tool-link')}
      >
        <Background variant={BackgroundVariant.Dots} gap={sizes.grid} size={sizes.dot} />
        <EdgeGrips />
        {minimap !== 'none' && (
          <MiniMap
            position={minimap}
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
