import { Handle, NodeResizer, type NodeProps } from '@xyflow/react'
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { minHeightForLabel } from '@/components/shapes/geometry'
import { ShapeView } from '@/components/shapes/ShapeView'
import { getShape } from '@/shapes/registry'
import { cn } from '@/lib/utils'
import { currentTarget, useSearchStore } from '@/search/searchStore'
import { useDiagramStore } from '@/store/diagramStore'
import { useUiStore } from '@/store/uiStore'
import { nodeAppearance } from './appearance'
import type { ShapeFlowNode } from './flow'
import { endResize, startResize } from './guideSession'
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
  // Search highlight (view state only; exports draw from the diagram, so it never appears in them).
  const found = useSearchStore((s) => s.matchIds.has(id))
  const current = useSearchStore((s) => currentTarget(s) === id)
  const appearance = useMemo(() => nodeAppearance(data.style), [data.style])
  const [labelRef, labelHeight] = useHeight()

  const shape = getShape(data.type)
  // Tallest the label needs the node to be; the node grows to fit rather than clipping.
  const minHeight = useMemo(
    () => Math.max(shape.minSize.height, labelHeight ? minHeightForLabel(data.type, width, labelHeight) : 0),
    [shape, data.type, width, labelHeight],
  )
  useEffect(() => {
    if (labelHeight && height < minHeight) useDiagramStore.getState().growNodeToFit(id, minHeight)
  }, [id, height, minHeight, labelHeight])

  return (
    <>
      <NodeResizer
        isVisible={selected && !editing && !data.locked}
        minWidth={shape.minSize.width}
        minHeight={minHeight}
        keepAspectRatio={shape.keepAspect}
        handleClassName="cl-resize-handle"
        lineClassName="cl-resize-line"
        // One resize gesture is one undo step.
        onResizeStart={startResize}
        onResizeEnd={endResize}
      />
      {found && (
        <div
          aria-hidden="true"
          className={cn('pointer-events-none absolute -inset-2 rounded-md bg-(--cl-found-subtle)', current && 'border-2 border-(--cl-found)')}
        />
      )}
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
        locked={data.locked}
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
