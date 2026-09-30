import { Handle, NodeResizer, type NodeProps } from '@xyflow/react'
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { minHeightForLabel } from '@/components/shapes/geometry'
import { ShapeView } from '@/components/shapes/ShapeView'
import { MIN_NODE_SIZE } from '@/schema/factories'
import { useDiagramStore } from '@/store/diagramStore'
import { useUiStore } from '@/store/uiStore'
import { nodeAppearance } from './appearance'
import type { ShapeFlowNode } from './flow'
import { HANDLE_POSITION, HANDLE_SIDES } from './handles'
import { LabelEditor } from './LabelEditor'

/** Measures an element's layout height (unaffected by canvas zoom) and keeps it up to date. */
function useHeight() {
  const ref = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setHeight(el.offsetHeight)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return [ref, height] as const
}

export const ShapeNode = memo(function ShapeNode({ id, data, selected, width = 0, height = 0 }: NodeProps<ShapeFlowNode>) {
  const editing = useUiStore((s) => s.editingId === id)
  const linkSource = useUiStore((s) => s.linkSourceId === id)
  const appearance = useMemo(() => nodeAppearance(data.style), [data.style])
  const [labelRef, labelHeight] = useHeight()

  // Tallest the label needs the node to be; the node grows to fit rather than clipping.
  const minHeight = useMemo(
    () => Math.max(MIN_NODE_SIZE, labelHeight ? minHeightForLabel(data.type, width, labelHeight) : 0),
    [data.type, width, labelHeight],
  )
  useEffect(() => {
    if (labelHeight && height < minHeight) useDiagramStore.getState().growNodeToFit(id, minHeight)
  }, [id, height, minHeight, labelHeight])

  return (
    <>
      <NodeResizer
        isVisible={selected && !editing}
        minWidth={MIN_NODE_SIZE}
        minHeight={minHeight}
        handleClassName="cl-resize-handle"
        lineClassName="cl-resize-line"
      />
      {linkSource && (
        <div aria-hidden="true" className="pointer-events-none absolute -inset-2 rounded-md border-2 border-dashed border-accent bg-accent-subtle" />
      )}
      <ShapeView
        type={data.type}
        size={{ width, height }}
        label={data.label}
        selected={selected}
        appearance={appearance}
        hasNotes={data.hasNotes}
        labelRef={labelRef}
        editor={editing ? <LabelEditor id={id} initial={data.label} /> : undefined}
      />
      {/* Every handle is a source; ConnectionMode.Loose lets any handle also be a target. */}
      {HANDLE_SIDES.map((side) => (
        <Handle key={side} id={side} type="source" position={HANDLE_POSITION[side]} className="cl-handle" />
      ))}
    </>
  )
})
