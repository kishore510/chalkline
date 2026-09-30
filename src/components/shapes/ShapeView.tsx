import { StickyNote } from 'lucide-react'
import type { ReactNode } from 'react'
import type { NodeAppearance } from '@/canvas/appearance'
import { cn } from '@/lib/utils'
import type { NodeType, Size } from '@/schema/diagram'
import { shapeGeometry } from './geometry'

/**
 * Draws one node. With no appearance it uses the theme defaults, so unstyled
 * nodes look right in both themes. Shared by the canvas and the style sheet.
 */
export function ShapeView({
  type,
  size,
  label,
  selected = false,
  appearance = {},
  hasNotes = false,
  editor,
  className,
}: {
  type: NodeType
  size: Size
  label: string
  selected?: boolean
  appearance?: NodeAppearance
  /** Shows a small badge so annotated nodes are discoverable. */
  hasNotes?: boolean
  /** Replaces the label text, e.g. with an inline editor. */
  editor?: ReactNode
  className?: string
}) {
  const { body, detail, label: box } = shapeGeometry(type, size)
  // A custom border colour stays visible when selected; the resize frame marks the selection.
  const strokeClass = appearance.stroke ? undefined : selected ? 'stroke-accent' : 'stroke-node-stroke'
  const strokeStyle = { stroke: appearance.stroke, strokeWidth: appearance.strokeWidth }
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
          <path key={d} d={d} className={cn('cl-node-stroke fill-node-fill', strokeClass)} style={{ ...strokeStyle, fill: appearance.fill }} />
        ))}
        {detail.map((d) => (
          <path key={d} d={d} className={cn('cl-node-stroke fill-none', strokeClass)} style={strokeStyle} />
        ))}
      </svg>
      {type === 'text' && selected && <div className="absolute inset-0 rounded-sm border border-dashed border-accent" />}
      <div
        className="absolute flex items-center justify-center overflow-hidden px-(--cl-node-padding) text-center text-node leading-tight font-medium break-words text-node-text"
        style={{ left: box.x, top: box.y, width: box.width, height: box.height, color: appearance.textColour, fontSize: appearance.fontSize }}
      >
        {editor ??
          (label ? (
            <span className="line-clamp-4 whitespace-pre-line">{label}</span>
          ) : (
            // Keep empty text nodes findable.
            type === 'text' && <span className="text-text-muted italic">Text</span>
          ))}
      </div>
      {hasNotes && (
        <span
          title="Has notes"
          className="absolute -top-2 -right-2 flex size-5 items-center justify-center rounded-full border border-border bg-surface text-text-muted shadow-sm"
        >
          <StickyNote className="size-3" aria-label="Has notes" />
        </span>
      )}
    </div>
  )
}
