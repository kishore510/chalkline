import { Handle, NodeResizer, type NodeProps } from '@xyflow/react'
import { memo } from 'react'
import { ShapeView } from '@/components/shapes/ShapeView'
import { MIN_NODE_SIZE } from '@/schema/factories'
import { useUiStore } from '@/store/uiStore'
import type { ShapeFlowNode } from './flow'
import { HANDLE_POSITION, HANDLE_SIDES } from './handles'
import { LabelEditor } from './LabelEditor'

export const ShapeNode = memo(function ShapeNode({ id, data, selected, width = 0, height = 0 }: NodeProps<ShapeFlowNode>) {
  const editing = useUiStore((s) => s.editingId === id)
  return (
    <>
      <NodeResizer
        isVisible={selected && !editing}
        minWidth={MIN_NODE_SIZE}
        minHeight={MIN_NODE_SIZE}
        handleClassName="cl-resize-handle"
        lineClassName="cl-resize-line"
      />
      <ShapeView
        type={data.type}
        size={{ width, height }}
        label={data.label}
        selected={selected}
        editor={editing ? <LabelEditor id={id} initial={data.label} /> : undefined}
      />
      {/* Every handle is a source; ConnectionMode.Loose lets any handle also be a target. */}
      {HANDLE_SIDES.map((side) => (
        <Handle key={side} id={side} type="source" position={HANDLE_POSITION[side]} className="cl-handle" />
      ))}
    </>
  )
})
