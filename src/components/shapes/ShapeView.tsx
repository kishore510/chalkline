import type { NodeType, Size } from '@/schema/diagram'
import { cn } from '@/lib/utils'
import { shapeGeometry } from './geometry'

/**
 * Draws one node with default (unstyled) theme colours. Shared by the style
 * sheet now and the React Flow node component in Phase 1.
 */
export function ShapeView({
  type,
  size,
  label,
  selected = false,
  className,
}: {
  type: NodeType
  size: Size
  label: string
  selected?: boolean
  className?: string
}) {
  const { body, detail, label: box } = shapeGeometry(type, size)
  return (
    <div className={cn('relative shrink-0', className)} style={{ width: size.width, height: size.height }}>
      <svg
        width={size.width}
        height={size.height}
        viewBox={`0 0 ${size.width} ${size.height}`}
        className="absolute inset-0 overflow-visible"
        aria-hidden="true"
      >
        {body.map((d) => (
          <path key={d} d={d} className={cn('cl-node-stroke fill-node-fill', selected ? 'stroke-accent' : 'stroke-node-stroke')} />
        ))}
        {detail.map((d) => (
          <path key={d} d={d} className={cn('cl-node-stroke fill-none', selected ? 'stroke-accent' : 'stroke-node-stroke')} />
        ))}
      </svg>
      {type === 'text' && selected && <div className="absolute inset-0 rounded-sm border border-dashed border-accent" />}
      <div
        className="absolute flex items-center justify-center overflow-hidden px-(--cl-node-padding) text-center text-node font-medium break-words text-node-text"
        style={{ left: box.x, top: box.y, width: box.width, height: box.height }}
      >
        <span className="line-clamp-3">{label}</span>
      </div>
    </div>
  )
}
