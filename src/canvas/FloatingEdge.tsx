import { BaseEdge, getBezierPath, getSmoothStepPath, getStraightPath, useInternalNode, type EdgeProps } from '@xyflow/react'
import { memo, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { edgeLabelText, textCss, type TextStyleFields } from '@/fonts/registry'
import type { TextDefaults } from '@/schema/diagram'
import { useDiagramStore } from '@/store/diagramStore'
import { useUiStore } from '@/store/uiStore'
import { internalBox } from './EdgeGrips'
import { floatingEndpoints, type Box } from './floating'
import type { FloatingFlowEdge } from './flow'
import { HANDLE_POSITION, type HandleSide } from './handles'
import { polylineMidpoint, polylinePath } from './polyline'
import { shiftAlongSide } from './spread'

// Corner radius for routed detours drawn with a rounded line type.
const DETOUR_RADIUS = 8

/**
 * A connector label: text on a rounded background, like React Flow's own, but
 * re-measured when its font changes or fonts finish loading (React Flow
 * measures only when the text changes, so the background would be wrong).
 */
function EdgeLabel({ x, y, label, text, defaults, padding, bgStyle, radius }: {
  x: number
  y: number
  label: string
  text: TextStyleFields | undefined
  defaults: TextDefaults | undefined
  padding: [number, number]
  bgStyle?: CSSProperties
  radius?: number
}) {
  const ref = useRef<SVGTextElement>(null)
  const [box, setBox] = useState({ width: 0, height: 0 })
  const resolved = edgeLabelText(text ?? {}, defaults, 0)
  // Size only when set on the connector; otherwise the stylesheet's label size applies.
  const style: CSSProperties = { ...textCss(resolved), textAlign: undefined, ...(text?.fontSize !== undefined && { fontSize: text.fontSize }) }
  const key = `${label}|${resolved.font.id}|${resolved.weight}|${resolved.italic}|${text?.fontSize ?? ''}`
  useLayoutEffect(() => {
    const measure = () => {
      const b = ref.current?.getBBox()
      if (b) setBox((prev) => (prev.width === b.width && prev.height === b.height ? prev : { width: b.width, height: b.height }))
    }
    measure()
    document.fonts?.addEventListener('loadingdone', measure)
    return () => document.fonts?.removeEventListener('loadingdone', measure)
  }, [key])
  const [px, py] = padding
  return (
    <g transform={`translate(${x - box.width / 2} ${y - box.height / 2})`} className="react-flow__edge-textwrapper" visibility={box.width ? 'visible' : 'hidden'}>
      <rect width={box.width + 2 * px} x={-px} y={-py} height={box.height + 2 * py} className="react-flow__edge-textbg" style={bgStyle} rx={radius} ry={radius} />
      <text ref={ref} className="react-flow__edge-text" y={box.height / 2} dy="0.3em" style={style}>
        {label}
      </text>
    </g>
  )
}

/**
 * Draws every connector. Ends attach at side midpoints on the sides the
 * router chose (pinned sides never change; auto sides avoid other shapes). While one of
 * its end grips is dragged, the dragged end follows the pointer (or the
 * docking point it has snapped to) as a live preview.
 */
export const FloatingEdge = memo(function FloatingEdge({ id, source, target, data, style, markerStart, markerEnd, label, labelBgStyle, labelBgPadding, labelBgBorderRadius, interactionWidth }: EdgeProps<FloatingFlowEdge>) {
  const sourceNode = useInternalNode(source)
  const targetNode = useInternalNode(target)
  const drag = useUiStore((s) => (s.edgeDrag?.edgeId === id ? s.edgeDrag : null))
  const snapNode = useDiagramStore((s) => (drag?.target ? s.diagram.nodes.find((n) => n.id === drag.target!.nodeId) : undefined))
  const defaults = useDiagramStore((s) => s.diagram.textDefaults)
  const labelAt = (x: number, y: number) =>
    typeof label === 'string' && label ? (
      <EdgeLabel x={x} y={y} label={label} text={data?.text} defaults={defaults} padding={labelBgPadding ?? [2, 4]} bgStyle={labelBgStyle} radius={labelBgBorderRadius} />
    ) : null
  if (!sourceNode || !targetNode || !data) return null

  let sourceBox: Box = internalBox(sourceNode)
  let targetBox: Box = internalBox(targetNode)
  let sourceSide: HandleSide | undefined = data.sourceSide
  let targetSide: HandleSide | undefined = data.targetSide
  if (drag) {
    // Snapped: attach to that docking point. Free: a zero-size box at the pointer.
    const box = snapNode && drag.target ? { ...snapNode.position, ...snapNode.size, type: snapNode.type } : { ...drag.point, width: 0, height: 0 }
    const side = drag.target?.side
    if (drag.end === 'source') [sourceBox, sourceSide] = [box, side]
    else [targetBox, targetSide] = [box, side]
  }

  // A routed detour (and no grip drag in progress) follows its polyline.
  if (!drag && data.detour) {
    const radius = data.lineType === 'smoothstep' || data.lineType === 'bezier' ? DETOUR_RADIUS : 0
    const mid = polylineMidpoint(data.detour)
    return (
      <>
        <BaseEdge id={id} path={polylinePath(data.detour, radius)} style={style} markerStart={markerStart} markerEnd={markerEnd} interactionWidth={interactionWidth} />
        {labelAt(mid.x, mid.y)}
      </>
    )
  }

  const ends = floatingEndpoints(sourceBox, targetBox, sourceSide, targetSide)
  // Spread ends that share a side (not while a grip is being dragged).
  const start = shiftAlongSide({ x: ends.sourceX, y: ends.sourceY }, ends.sourceSide, drag ? 0 : (data.sourceShift ?? 0))
  const end = shiftAlongSide({ x: ends.targetX, y: ends.targetY }, ends.targetSide, drag ? 0 : (data.targetShift ?? 0))
  const params = {
    sourceX: start.x,
    sourceY: start.y,
    targetX: end.x,
    targetY: end.y,
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
    <>
      <BaseEdge id={id} path={path} style={style} markerStart={markerStart} markerEnd={markerEnd} interactionWidth={interactionWidth} />
      {labelAt(labelX, labelY)}
    </>
  )
})
