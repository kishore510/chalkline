import { useInternalNode, useReactFlow, useStore, ViewportPortal, type InternalNode } from '@xyflow/react'
import { Pin } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { readToken } from '@/lib/cssVar'
import { cn } from '@/lib/utils'
import type { DiagramEdge, DiagramNode } from '@/schema/diagram'
import { useDiagramStore } from '@/store/diagramStore'
import { useUiStore, type EdgeEnd } from '@/store/uiStore'
import { findDockingTarget } from './docking'
import { sidePoint, type Box } from './floating'
import { HANDLE_SIDES, type HandleSide } from './handles'
import type { FloatingEdgeData } from './flow'
import { routeEdge } from './routing'
import { shiftAlongSide } from './spread'

// Distance (CSS px) a grip must move before a press becomes a drag rather than a tap.
const DRAG_THRESHOLD = 6

export const sideOf = (handle: string | undefined): HandleSide | undefined =>
  HANDLE_SIDES.includes(handle as HandleSide) ? (handle as HandleSide) : undefined

export function internalBox(node: InternalNode): Box {
  return {
    x: node.internals.positionAbsolute.x,
    y: node.internals.positionAbsolute.y,
    width: node.measured.width ?? node.width ?? 0,
    height: node.measured.height ?? node.height ?? 0,
  }
}

/** Keeps overlay elements the same size on screen at any zoom. */
function Unscaled({ x, y, zoom, children, className }: { x: number; y: number; zoom: number; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('absolute top-0 left-0', className)} style={{ transform: `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${1 / zoom})` }}>
      {children}
    </div>
  )
}

function DockingPoints({ node, active, zoom }: { node: DiagramNode; active: HandleSide | null; zoom: number }) {
  const box = { ...node.position, ...node.size }
  return (
    <>
      {HANDLE_SIDES.map((side) => {
        const p = sidePoint(box, side)
        return (
          <Unscaled key={side} x={p.x} y={p.y} zoom={zoom} className="pointer-events-none">
            <div className="flex size-touch items-center justify-center">
              <div
                className={cn(
                  'size-(--cl-dock-dot) rounded-full border-2 border-accent transition-transform',
                  side === active ? 'scale-150 bg-accent' : 'bg-surface',
                )}
              />
            </div>
          </Unscaled>
        )
      })}
    </>
  )
}

function Grip({ edge, end, x, y, zoom, pinned }: { edge: DiagramEdge; end: EdgeEnd; x: number; y: number; zoom: number; pinned: boolean }) {
  const { screenToFlowPosition } = useReactFlow()
  const gesture = useRef<{ pointerId: number; x: number; y: number; moved: boolean } | null>(null)
  const ui = useUiStore.getState

  // If the grip goes away mid-drag (selection or mode changed), drop the preview.
  useEffect(
    () => () => {
      if (gesture.current && ui().edgeDrag?.edgeId === edge.id) ui().setEdgeDrag(null)
    },
    [edge.id, ui],
  )

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    gesture.current = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, moved: false }
    ui().closeContextMenu()
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const g = gesture.current
    if (!g || g.pointerId !== e.pointerId) return
    e.stopPropagation()
    if (!g.moved && Math.hypot(e.clientX - g.x, e.clientY - g.y) < DRAG_THRESHOLD) return
    g.moved = true
    const point = screenToFlowPosition({ x: e.clientX, y: e.clientY })
    const other = end === 'source' ? edge.target : edge.source
    const radius = readToken('--cl-dock-radius', 40) / zoom
    const target = findDockingTarget(point, useDiagramStore.getState().diagram.nodes, radius, other)
    ui().setEdgeDrag({ edgeId: edge.id, end, point, target })
  }

  const finish = (e: React.PointerEvent, commit: boolean) => {
    const g = gesture.current
    if (!g || g.pointerId !== e.pointerId) return
    e.stopPropagation()
    gesture.current = null
    const drag = ui().edgeDrag
    ui().setEdgeDrag(null)
    if (!commit) return
    if (!g.moved) {
      // A tap opens the grip menu (Reset to auto).
      ui().openContextMenu({ kind: 'grip', id: edge.id, end, x: e.clientX, y: e.clientY })
      return
    }
    // Released away from a docking point: nothing changes, so the original stays.
    if (!drag?.target) return
    const { target } = drag
    useDiagramStore.getState().reconnectEdge(edge.id, {
      source: end === 'source' ? target.nodeId : edge.source,
      target: end === 'target' ? target.nodeId : edge.target,
      sourceHandle: end === 'source' ? target.side : (sideOf(edge.sourceHandle) ?? null),
      targetHandle: end === 'target' ? target.side : (sideOf(edge.targetHandle) ?? null),
    })
  }

  const label = `${end === 'source' ? 'Start' : 'End'} of connector${pinned ? ', pinned' : ''}. Drag to re-attach, tap for options.`
  return (
    <Unscaled x={x} y={y} zoom={zoom}>
      <button
        type="button"
        aria-label={label}
        title={label}
        // nodrag/nopan: React Flow must not treat this as a node drag or a pan.
        className="nodrag nopan nowheel pointer-events-auto relative flex size-touch touch-none cursor-grab items-center justify-center rounded-full active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => finish(e, true)}
        onPointerCancel={(e) => finish(e, false)}
        onLostPointerCapture={(e) => finish(e, false)}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <span className={cn('size-(--cl-handle-dot) rounded-full border-2 border-accent shadow-sm', pinned ? 'bg-accent' : 'bg-surface')} />
        {pinned && (
          <span className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-accent text-on-accent shadow-sm">
            <Pin className="size-2.5" aria-hidden="true" />
          </span>
        )}
      </button>
    </Unscaled>
  )
}

function Grips({ edge }: { edge: DiagramEdge }) {
  const sourceNode = useInternalNode(edge.source)
  const targetNode = useInternalNode(edge.target)
  const zoom = useStore((s) => s.transform[2])
  const drag = useUiStore((s) => (s.edgeDrag?.edgeId === edge.id ? s.edgeDrag : null))
  const dockNode = useDiagramStore((s) => (drag?.target ? s.diagram.nodes.find((n) => n.id === drag.target!.nodeId) : undefined))
  const nodes = useDiagramStore((s) => s.diagram.nodes)
  // The drawn edge's spread offsets, so grips sit exactly on its ends.
  const data = useStore((s) => s.edgeLookup.get(edge.id)?.data as FloatingEdgeData | undefined)
  if (!sourceNode || !targetNode) return null

  // Same routing as the drawn edge, so grips sit exactly on its ends.
  const route = routeEdge(nodes, edge)
  const at = (end: EdgeEnd) => {
    if (drag?.end === end) return drag.target ?? drag.point
    return end === 'source'
      ? shiftAlongSide(sidePoint(internalBox(sourceNode), route.sourceSide), route.sourceSide, data?.sourceShift ?? 0)
      : shiftAlongSide(sidePoint(internalBox(targetNode), route.targetSide), route.targetSide, data?.targetShift ?? 0)
  }
  return (
    <>
      {dockNode && <DockingPoints node={dockNode} active={drag?.target?.side ?? null} zoom={zoom} />}
      {(['source', 'target'] as const).map((end) => {
        const p = at(end)
        const pinned = drag?.end === end ? Boolean(drag.target) : Boolean(sideOf(end === 'source' ? edge.sourceHandle : edge.targetHandle))
        return <Grip key={end} edge={edge} end={end} x={p.x} y={p.y} zoom={zoom} pinned={pinned} />
      })}
    </>
  )
}

/** End grips for the selected connector (Select mode only), plus docking points while one is dragged. */
export function EdgeGrips() {
  const selectTool = useUiStore((s) => s.tool === 'select')
  const edge = useDiagramStore((s) => (s.selection.length === 1 ? s.diagram.edges.find((e) => e.id === s.selection[0]) : undefined))
  if (!selectTool || !edge) return null
  return (
    <ViewportPortal>
      <Grips edge={edge} />
    </ViewportPortal>
  )
}
