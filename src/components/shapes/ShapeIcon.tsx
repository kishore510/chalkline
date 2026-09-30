import { Type } from 'lucide-react'
import type { NodeType } from '@/schema/diagram'
import { cn } from '@/lib/utils'
import { shapeGeometry } from './geometry'

// Icon-sized boxes per type, keeping each shape's natural proportions.
const ICON_SIZE: Record<Exclude<NodeType, 'text'>, { width: number; height: number }> = {
  rectangle: { width: 22, height: 14 },
  rounded: { width: 22, height: 14 },
  database: { width: 16, height: 20 },
  cloud: { width: 24, height: 16 },
  actor: { width: 12, height: 22 },
}

/** Small palette glyph drawn from the same geometry as the real node. */
export function ShapeIcon({ type, className }: { type: NodeType; className?: string }) {
  if (type === 'text') return <Type className={className} aria-hidden="true" />
  const size = ICON_SIZE[type]
  const { body, detail } = shapeGeometry(type, type === 'actor' ? { ...size, height: size.height + 7 } : size)
  return (
    <svg viewBox="-2 -2 28 28" aria-hidden="true" className={cn('size-6', className)}>
      <g transform={`translate(${(24 - size.width) / 2} ${(24 - size.height) / 2})`} className="fill-none stroke-current cl-node-stroke">
        {[...body, ...detail].map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
    </svg>
  )
}
