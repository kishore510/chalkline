import { BaseEdge, getBezierPath, getSmoothStepPath, getStraightPath, useInternalNode, type EdgeProps, type InternalNode } from '@xyflow/react'
import { floatingEndpoints, type Box } from './floating'
import type { FloatingFlowEdge } from './flow'
import { HANDLE_POSITION } from './handles'

function boxOf(node: InternalNode): Box {
  return {
    x: node.internals.positionAbsolute.x,
    y: node.internals.positionAbsolute.y,
    width: node.measured.width ?? node.width ?? 0,
    height: node.measured.height ?? node.height ?? 0,
  }
}

/** An edge that attaches to the nearest facing sides of its nodes, recomputed as they move. */
export function FloatingEdge({ id, source, target, data, style, markerStart, markerEnd, label, labelStyle, labelShowBg, labelBgStyle, labelBgPadding, labelBgBorderRadius, interactionWidth }: EdgeProps<FloatingFlowEdge>) {
  const sourceNode = useInternalNode(source)
  const targetNode = useInternalNode(target)
  if (!sourceNode || !targetNode || !data) return null

  const ends = floatingEndpoints(boxOf(sourceNode), boxOf(targetNode), data.sourceSide, data.targetSide)
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
