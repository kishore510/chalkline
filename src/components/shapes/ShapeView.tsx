import { StickyNote } from 'lucide-react'
import type { ReactNode, Ref } from 'react'
import type { NodeAppearance } from '@/canvas/appearance'
import { cn } from '@/lib/utils'
import type { NodeType, Size } from '@/schema/diagram'
import { labelLayout, shapeGeometry } from './geometry'

/** Label font size: the chosen (or default) size, but never below the touch minimum. */
function labelFontSize(fontSize: number | undefined): string {
  return `max(var(--cl-node-font-min), ${fontSize ? `${fontSize}px` : 'var(--text-node)'})`
}

/**
 * Draws one node. With no appearance it uses the theme defaults, so unstyled
 * nodes look right in both themes. Shared by the canvas and the style sheet.
 *
 * Labels are laid out separately from the outline and are never clipped:
 * they wrap at spaces (breaking a word only if it can't fit on a line by
 * itself), and actor and text labels may spread wider than the node.
 */
export function ShapeView({
  type,
  size,
  label,
  selected = false,
  appearance = {},
  hasNotes = false,
  editor,
  labelRef,
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
  /** The label's content box, for measuring how tall it wants to be. */
  labelRef?: Ref<HTMLDivElement>
  className?: string
}) {
  const { body, detail } = shapeGeometry(type, size)
  const { box, fit, align } = labelLayout(type, size)
  // A custom border colour stays visible when selected; the resize frame marks the selection.
  const strokeClass = appearance.stroke ? undefined : selected ? 'stroke-accent' : 'stroke-node-stroke'
  const strokeStyle = { stroke: appearance.stroke, strokeWidth: appearance.strokeWidth }
  // A single unbroken word may break anywhere as a last resort; otherwise wrap at spaces only.
  const singleWord = label.trim() !== '' && !/\s/.test(label.trim())
  const free = fit === 'free'

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
        className={cn('absolute flex justify-center', align === 'center' ? 'items-center' : 'items-start')}
        style={{ left: box.x, top: box.y, width: box.width, height: box.height }}
      >
        <div
          ref={labelRef}
          className={cn(
            'shrink-0 text-center font-medium whitespace-pre-line text-node-text',
            singleWord ? 'wrap-anywhere' : 'wrap-break-word',
            free ? 'px-1 pt-1' : 'w-full p-(--cl-node-padding)',
          )}
          style={{
            color: appearance.textColour,
            fontSize: labelFontSize(appearance.fontSize),
            lineHeight: 'var(--text-node--line-height)',
            // Free labels size to their text, up to a cap that is never narrower than the node.
            ...(free && {
              width: editor ? `max(${box.width}px, var(--cl-label-free-max))` : 'max-content',
              maxWidth: `max(${box.width}px, var(--cl-label-free-max))`,
            }),
          }}
        >
          {editor ??
            (label ? (
              label
            ) : (
              // Keep empty text nodes findable.
              type === 'text' && <span className="text-text-muted italic">Text</span>
            ))}
        </div>
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
