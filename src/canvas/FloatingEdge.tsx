import { BaseEdge, getBezierPath, getSmoothStepPath, getStraightPath, useInternalNode, type EdgeProps } from '@xyflow/react'
import { useDiagramStore } from '@/store/diagramStore'
import { useUiStore } from '@/store/uiStore'
import { internalBox } from './EdgeGrips'
import { floatingEndpoints, type Box } from './floating'
import type { FloatingFlowEdge } from './flow'
import { HANDLE_POSITION, type HandleSide } from './handles'
import { polylineMidpoint, polylinePath } from './polyline'

// Corner radius for routed detours drawn with a rounded line type.
const DETOUR_RADIUS = 8

/**
 * Draws every connector. Ends attach at side midpoints on the sides the
 * router chose (pinned sides never change; auto sides avoid other shapes). While one of
 * its end grips is dragged, the dragged end follows the pointer (or the
 * docking point it has snapped to) as a live preview.
 */
export function FloatingEdge({ id, source, target, data, style, markerStart, markerEnd, label, labelStyle, labelShowBg, labelBgStyle, labelBgPadding, labelBgBorderRadius, interactionWidth }: EdgeProps<FloatingFlowEdge>) {
  const sourceNode = useInternalNode(source)
  const targetNode = useInternalNode(target)
  const drag = useUiStore((s) => (s.edgeDrag?.edgeId === id ? s.edgeDrag : null))
  const snapNode = useDiagramStore((s) => (drag?.target ? s.diagram.nodes.find((n) => n.id === drag.target!.nodeId) : undefined))
  if (!sourceNode || !targetNode || !data) return null

  let sourceBox: Box = internalBox(sourceNode)
  let targetBox: Box = internalBox(targetNode)
  let sourceSide: HandleSide | undefined = data.sourceSide
  let targetSide: HandleSide | undefined = data.targetSide
  if (drag) {
    // Snapped: attach to that docking point. Free: a zero-size box at the pointer.
    const box = snapNode && drag.target ? { ...snapNode.position, ...snapNode.size } : { ...drag.point, width: 0, height: 0 }
    const side = drag.target?.side
    if (drag.end === 'source') [sourceBox, sourceSide] = [box, side]
    else [targetBox, targetSide] = [box, side]
  }

  // A routed detour (and no grip drag in progress) follows its polyline.
  if (!drag && data.detour) {
    const radius = data.lineType === 'smoothstep' || data.lineType === 'bezier' ? DETOUR_RADIUS : 0
    const mid = polylineMidpoint(data.detour)
    return (
      <BaseEdge
        id={id}
        path={polylinePath(data.detour, radius)}
        style={style}
        markerStart={markerStart}
        markerEnd={markerEnd}
        label={label}
        labelX={mid.x}
        labelY={mid.y}
        labelStyle={labelStyle}
        labelShowBg={labelShowBg}
        labelBgStyle={labelBgStyle}
        labelBgPadding={labelBgPadding}
        labelBgBorderRadius={labelBgBorderRadius}
        interactionWidth={interactionWidth}
      />
    )
  }

  const ends = floatingEndpoints(sourceBox, targetBox, sourceSide, targetSide)
  const params = {
    sourceX: ends.sourceX,
    sourceY: ends.sourceY,
    targetX: ends.targetX,
    targetY: ends.targetY,
    sourcePosition: HANDLE_POSITION[ends.sourceSide],
    targetPosition: HANDLE_POSITION[ends.targetSide],
  }
  const [path, labelX, labelY] =
    data.lineType === 'straight'
      ? getStraightPath(params)
      : data.lineType === 'bezier'
        ? getBezierPath(params)
        : getSmoothStepPath({ ...params, borderRadius: data.lineType === 'step' ? 0 : undefined })

  return (
    <BaseEdge
      id={id}
      path={path}
      style={style}
      markerStart={markerStart}
      markerEnd={markerEnd}
      label={label}
      labelX={labelX}
      labelY={labelY}
      labelStyle={labelStyle}
      labelShowBg={labelShowBg}
      labelBgStyle={labelBgStyle}
      labelBgPadding={labelBgPadding}
      labelBgBorderRadius={labelBgBorderRadius}
      interactionWidth={interactionWidth}
    />
  )
}
