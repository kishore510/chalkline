import { ChevronsLeft, ChevronsRight, X } from 'lucide-react'
import { useRef, useState, type ComponentProps } from 'react'
import { createPortal } from 'react-dom'
import { useCanvasActions } from '@/canvas/useCanvasActions'
import { ShapeIcon } from '@/components/shapes/ShapeIcon'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { NODE_TYPES, type NodeType } from '@/schema/diagram'
import { useUiStore } from '@/store/uiStore'

export const SHAPE_NAMES: Record<NodeType, string> = {
  rectangle: 'Rectangle',
  rounded: 'Rounded box',
  database: 'Database',
  cloud: 'Cloud',
  actor: 'Actor',
  text: 'Text',
}

// Distance (CSS px) a pointer must travel before a press becomes a drag.
const DRAG_THRESHOLD = 6

interface Ghost {
  type: NodeType
  x: number
  y: number
}

/**
 * Tap a palette item to add the shape at the centre of the view, or drag it
 * onto the canvas to drop it at a point. Built on pointer events so mouse,
 * touch and pen all behave the same.
 */
function usePaletteGestures({ onAdded, onDragStart }: { onAdded?: () => void; onDragStart?: () => void }) {
  const actions = useCanvasActions()
  const [ghost, setGhost] = useState<Ghost | null>(null)
  const hooks = useRef({ onAdded, onDragStart })
  hooks.current = { onAdded, onDragStart }

  const itemProps = (type: NodeType) => ({
    onPointerDown(e: React.PointerEvent) {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      const start = { x: e.clientX, y: e.clientY }
      let dragging = false

      const move = (ev: PointerEvent) => {
        if (ev.pointerId !== e.pointerId) return
        if (!dragging && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) > DRAG_THRESHOLD) {
          dragging = true
          hooks.current.onDragStart?.()
        }
        if (dragging) setGhost({ type, x: ev.clientX, y: ev.clientY })
      }
      const end = (ev: PointerEvent) => {
        if (ev.pointerId !== e.pointerId) return
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', end)
        window.removeEventListener('pointercancel', end)
        setGhost(null)
        if (ev.type === 'pointercancel') return
        const added = dragging ? actions.addAtScreenPoint(type, ev.clientX, ev.clientY) : (actions.addAtCenter(type), true)
        if (added) hooks.current.onAdded?.()
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', end)
      window.addEventListener('pointercancel', end)
    },
    onClick(e: React.MouseEvent) {
      // Pointer taps are handled above; this covers keyboard activation (Enter/Space).
      if (e.detail === 0) {
        actions.addAtCenter(type)
        hooks.current.onAdded?.()
      }
    },
  })

  const ghostElement =
    ghost &&
    createPortal(
      <div
        aria-hidden="true"
        className="pointer-events-none fixed z-50 flex size-touch -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-md border border-accent bg-surface text-accent shadow-lg"
        style={{ left: ghost.x, top: ghost.y }}
      >
        <ShapeIcon type={ghost.type} />
      </div>,
      document.body,
    )

  return { itemProps, ghostElement }
}

function PaletteItem({ shape, compact, ...props }: { shape: NodeType; compact?: boolean } & Omit<ComponentProps<'button'>, 'type'>) {
  return (
    <button
      type="button"
      title={`Add ${SHAPE_NAMES[shape].toLowerCase()}`}
      aria-label={`Add ${SHAPE_NAMES[shape].toLowerCase()}`}
      // touch-none: let pointer events drive the drag instead of scrolling.
      className={cn(
        'flex min-h-touch touch-none items-center gap-3 rounded-md text-sm text-text transition-colors select-none',
        'hover:bg-surface-muted active:bg-accent-subtle',
        compact ? 'size-touch justify-center' : 'flex-col justify-center gap-1.5 border border-border bg-surface px-2 py-3',
      )}
      {...props}
    >
      <ShapeIcon type={shape} className="size-7 shrink-0" />
      {!compact && <span className="text-xs text-text-muted">{SHAPE_NAMES[shape]}</span>}
    </button>
  )
}

const HINT = 'Tap to add, or drag onto the canvas.'

/** Desktop: persistent left panel. */
export function PalettePanel() {
  const { itemProps, ghostElement } = usePaletteGestures({})
  return (
    <aside aria-label="Shapes" className="flex w-palette shrink-0 flex-col gap-3 overflow-y-auto border-r border-border bg-surface p-4">
      <h2 className="text-sm font-semibold">Shapes</h2>
      <div className="grid grid-cols-2 gap-2">
        {NODE_TYPES.map((type) => (
          <PaletteItem key={type} shape={type} {...itemProps(type)} />
        ))}
      </div>
      <p className="text-xs text-text-muted">{HINT}</p>
      {ghostElement}
    </aside>
  )
}

/** Tablet: icon rail that expands to show names. */
export function PaletteRail() {
  const [expanded, setExpanded] = useState(false)
  const { itemProps, ghostElement } = usePaletteGestures({})
  return (
    <aside
      aria-label="Shapes"
      className={cn(
        'flex shrink-0 flex-col gap-2 overflow-y-auto border-r border-border bg-surface py-2 transition-all',
        expanded ? 'w-palette px-3' : 'w-rail items-center',
      )}
    >
      <Button
        variant="ghost"
        size="icon"
        aria-label={expanded ? 'Collapse shapes' : 'Expand shapes'}
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
        className={expanded ? 'self-end' : undefined}
      >
        {expanded ? <ChevronsLeft /> : <ChevronsRight />}
      </Button>
      {expanded ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            {NODE_TYPES.map((type) => (
              <PaletteItem key={type} shape={type} {...itemProps(type)} />
            ))}
          </div>
          <p className="text-xs text-text-muted">{HINT}</p>
        </>
      ) : (
        NODE_TYPES.map((type) => <PaletteItem key={type} shape={type} compact {...itemProps(type)} />)
      )}
      {ghostElement}
    </aside>
  )
}

/** Phone: bottom drawer opened from the toolbar. Stays mounted so an in-progress drag keeps its pointer. */
export function PaletteDrawer() {
  const open = useUiStore((s) => s.paletteOpen)
  const setOpen = useUiStore((s) => s.setPaletteOpen)
  const [dragging, setDragging] = useState(false)
  const { itemProps, ghostElement } = usePaletteGestures({
    onDragStart: () => setDragging(true),
    onAdded: () => {
      setDragging(false)
      setOpen(false)
    },
  })
  const shown = open && !dragging

  return (
    <div
      role="dialog"
      aria-label="Add a shape"
      aria-hidden={!open}
      onPointerUp={() => setDragging(false)}
      className={cn(
        'cl-safe-bottom fixed inset-x-0 bottom-0 z-30 rounded-t-lg border-t border-border bg-surface shadow-lg transition-transform duration-(--cl-duration-base) ease-standard',
        shown ? 'translate-y-0' : 'translate-y-full',
        !open && 'invisible',
      )}
    >
      <div className="flex min-h-touch items-center justify-between gap-2 pr-2 pl-4">
        <h2 className="text-sm font-semibold">Add a shape</h2>
        <Button variant="ghost" size="icon" aria-label="Close" onClick={() => setOpen(false)} tabIndex={open ? 0 : -1}>
          <X />
        </Button>
      </div>
      <div className="grid grid-cols-3 gap-2 px-4">
        {NODE_TYPES.map((type) => (
          <PaletteItem key={type} shape={type} {...itemProps(type)} tabIndex={open ? 0 : -1} />
        ))}
      </div>
      <p className="px-4 pt-3 text-xs text-text-muted">{HINT}</p>
      {ghostElement}
    </div>
  )
}
