import { ChevronsLeft, ChevronsRight, Columns3, Rows3, Search, X } from 'lucide-react'
import { useRef, useState, type ComponentProps } from 'react'
import { createPortal } from 'react-dom'
import { useCanvasActions } from '@/canvas/useCanvasActions'
import { ShapeIcon } from '@/components/shapes/ShapeIcon'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { getShape } from '@/shapes/registry'
import type { ShapeDefinition } from '@/shapes/types'
import { byCategory, searchShapes } from './paletteModel'
import { useUiStore } from '@/store/uiStore'

// Distance (CSS px) a pointer must travel before a press becomes a drag.
const DRAG_THRESHOLD = 6

interface Ghost {
  type: string
  x: number
  y: number
}

/**
 * Tap a palette item to add the shape at the centre of the view, or drag it
 * onto the canvas to drop it at a point. Built on pointer events so mouse,
 * touch and pen all behave the same.
 */
function usePaletteGestures({ onAdded, onDragStart }: { onAdded?: () => void; onDragStart?: () => void }) {
  const noteShapeUsed = useUiStore((s) => s.noteShapeUsed)
  const actions = useCanvasActions()
  const [ghost, setGhost] = useState<Ghost | null>(null)
  const hooks = useRef({ onAdded, onDragStart })
  hooks.current = { onAdded, onDragStart }

  const itemProps = (type: string) => ({
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
        if (!added) return
        noteShapeUsed(type)
        hooks.current.onAdded?.()
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', end)
      window.addEventListener('pointercancel', end)
    },
    onClick(e: React.MouseEvent) {
      // Pointer taps are handled above; this covers keyboard activation (Enter/Space).
      if (e.detail === 0) {
        actions.addAtCenter(type)
        noteShapeUsed(type)
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

/**
 * `scroll`: the one direction the list around this item scrolls in; dragging
 * the other way pulls the shape out onto the canvas.
 */
function PaletteItem({
  shape,
  compact,
  scroll = 'y',
  className,
  ...props
}: { shape: string; compact?: boolean; scroll?: 'x' | 'y' } & Omit<ComponentProps<'button'>, 'type'>) {
  return (
    <button
      type="button"
      title={`Add ${getShape(shape).name.toLowerCase()}`}
      aria-label={`Add ${getShape(shape).name.toLowerCase()}`}
      className={cn(
        'flex min-h-touch items-center gap-3 rounded-md text-sm text-text transition-colors select-none',
        scroll === 'x' ? 'touch-pan-x' : 'touch-pan-y',
        className,
        'hover:bg-surface-muted active:bg-accent-subtle',
        compact ? 'size-touch justify-center' : 'flex-col justify-center gap-1.5 border border-border bg-surface px-2 py-3',
      )}
      {...props}
    >
      <ShapeIcon type={shape} className="size-7 shrink-0" />
      {!compact && <span className="text-center text-xs leading-tight text-text-muted">{getShape(shape).name}</span>}
    </button>
  )
}

const HINT = 'Tap to add, or drag onto the canvas.'

const SWIMLANES = [
  { orientation: 'horizontal', label: 'Swimlane ↔', title: 'Add a swimlane pool: lanes stacked, headers on the left', icon: <Rows3 className="size-7" /> },
  { orientation: 'vertical', label: 'Swimlane ↕', title: 'Add a swimlane pool: lanes side by side, headers on top', icon: <Columns3 className="size-7" /> },
] as const

/** "Swimlane" entries: choose horizontal or vertical; tapping adds a pool with three lanes. */
function SwimlaneItems({ compact, onAdded, tabIndex }: { compact?: boolean; onAdded?: () => void; tabIndex?: number }) {
  const actions = useCanvasActions()
  return (
    <>
      {SWIMLANES.map((s) => (
        <button
          key={s.orientation}
          type="button"
          title={s.title}
          aria-label={s.title}
          tabIndex={tabIndex}
          onClick={() => {
            actions.addPoolAtCenter(s.orientation)
            onAdded?.()
          }}
          className={cn(
            'flex min-h-touch items-center gap-3 rounded-md text-sm text-text transition-colors select-none',
            'hover:bg-surface-muted active:bg-accent-subtle',
            compact ? 'size-touch justify-center' : 'flex-col justify-center gap-1.5 border border-border bg-surface px-2 py-3',
          )}
        >
          {s.icon}
          {!compact && <span className="text-xs text-text-muted">{s.label}</span>}
        </button>
      ))}
    </>
  )
}

function SearchField({ value, onChange, tabIndex }: { value: string; onChange: (value: string) => void; tabIndex?: number }) {
  return (
    <label className="relative block">
      <span className="sr-only">Search shapes</span>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-text-muted" aria-hidden="true" />
      <input
        type="search"
        value={value}
        tabIndex={tabIndex}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search shapes"
        className="h-touch w-full min-w-0 rounded-md border border-border-strong bg-surface pr-3 pl-10 text-base text-text placeholder:text-text-muted"
      />
    </label>
  )
}

const NoMatches = ({ query }: { query: string }) => <p className="py-2 text-sm text-text-muted">No shapes match “{query.trim()}”.</p>

/** Headed category sections (or flat results while searching), as a grid. */
function ShapeSections({
  query,
  itemProps,
  columns = 2,
  tabIndex,
}: {
  query: string
  itemProps: (type: string) => object
  columns?: 2 | 3
  tabIndex?: number
}) {
  const results = searchShapes(query)
  const grid = cn('grid gap-2', columns === 3 ? 'grid-cols-3' : 'grid-cols-2')
  if (query.trim()) {
    return results.length ? (
      <div className={grid}>
        {results.map((s) => (
          <PaletteItem key={s.id} shape={s.id} tabIndex={tabIndex} {...itemProps(s.id)} />
        ))}
      </div>
    ) : (
      <NoMatches query={query} />
    )
  }
  return (
    <>
      {byCategory(results).map((group) => (
        <section key={group.id} aria-label={group.name} className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold tracking-wide text-text-muted uppercase">{group.name}</h3>
          <div className={grid}>
            {group.shapes.map((s) => (
              <PaletteItem key={s.id} shape={s.id} tabIndex={tabIndex} {...itemProps(s.id)} />
            ))}
          </div>
        </section>
      ))}
    </>
  )
}

/** Desktop: persistent left panel with search and category headings. */
export function PalettePanel() {
  const [query, setQuery] = useState('')
  const { itemProps, ghostElement } = usePaletteGestures({})
  return (
    <aside aria-label="Shapes" className="flex w-palette shrink-0 flex-col gap-4 overflow-y-auto border-r border-border bg-surface p-4">
      <SearchField value={query} onChange={setQuery} />
      <ShapeSections query={query} itemProps={itemProps} />
      <p className="text-xs text-text-muted">{HINT}</p>
      {!query.trim() && (
        <section aria-label="Structure" className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold tracking-wide text-text-muted uppercase">Structure</h3>
          <div className="grid grid-cols-2 gap-2">
            <SwimlaneItems />
          </div>
        </section>
      )}
      {ghostElement}
    </aside>
  )
}

/** Tablet: icon rail that expands to show names, search and categories. */
export function PaletteRail() {
  const [expanded, setExpanded] = useState(false)
  const [query, setQuery] = useState('')
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
          <SearchField value={query} onChange={setQuery} />
          <ShapeSections query={query} itemProps={itemProps} />
          <p className="text-xs text-text-muted">{HINT}</p>
          <div className="grid grid-cols-2 gap-2">
            <SwimlaneItems />
          </div>
        </>
      ) : (
        <>
          {byCategory(searchShapes('')).map((group, i) => (
            <div key={group.id} role="group" aria-label={group.name} className="flex flex-col items-center gap-1">
              {i > 0 && <div aria-hidden="true" className="my-1 h-px w-8 bg-border" />}
              {group.shapes.map((s) => (
                <PaletteItem key={s.id} shape={s.id} compact {...itemProps(s.id)} />
              ))}
            </div>
          ))}
          <div aria-hidden="true" className="my-1 h-px w-8 bg-border" />
          <SwimlaneItems compact />
        </>
      )}
      {ghostElement}
    </aside>
  )
}

/** A horizontally scrolling row of shapes (phone drawer). Dragging upwards pulls a shape onto the canvas. */
function ShapeRow({ label, shapes, itemProps, tabIndex }: { label: string; shapes: ShapeDefinition[]; itemProps: (type: string) => object; tabIndex?: number }) {
  return (
    <section aria-label={label} className="flex flex-col gap-1.5">
      <h3 className="px-4 text-xs font-semibold tracking-wide text-text-muted uppercase">{label}</h3>
      <div className="flex gap-2 overflow-x-auto px-4 pb-1">
        {shapes.map((s) => (
          <PaletteItem key={s.id} shape={s.id} scroll="x" tabIndex={tabIndex} className="w-20 shrink-0" {...itemProps(s.id)} />
        ))}
      </div>
    </section>
  )
}

/** Phone: bottom drawer opened from the toolbar. Stays mounted so an in-progress drag keeps its pointer. */
export function PaletteDrawer() {
  const open = useUiStore((s) => s.paletteOpen)
  const setOpen = useUiStore((s) => s.setPaletteOpen)
  const recents = useUiStore((s) => s.recentShapes)
  const [query, setQuery] = useState('')
  const [dragging, setDragging] = useState(false)
  const { itemProps, ghostElement } = usePaletteGestures({
    onDragStart: () => setDragging(true),
    onAdded: () => {
      setDragging(false)
      setOpen(false)
    },
  })
  const shown = open && !dragging
  const tab = open ? 0 : -1
  const results = searchShapes(query)

  return (
    <div
      role="dialog"
      aria-label="Add a shape"
      aria-hidden={!open}
      onPointerUp={() => setDragging(false)}
      className={cn(
        'cl-safe-bottom fixed inset-x-0 bottom-0 z-30 flex max-h-(--cl-drawer-max-height) flex-col rounded-t-lg border-t border-border bg-surface shadow-lg transition-transform duration-(--cl-duration-base) ease-standard',
        shown ? 'translate-y-0' : 'translate-y-full',
        !open && 'invisible',
      )}
    >
      <div className="flex min-h-touch shrink-0 items-center justify-between gap-2 pr-2 pl-4">
        <h2 className="text-sm font-semibold">Add a shape</h2>
        <Button variant="ghost" size="icon" aria-label="Close" onClick={() => setOpen(false)} tabIndex={tab}>
          <X />
        </Button>
      </div>
      {/* Search first, then recents and categories. */}
      <div className="shrink-0 px-4 pb-3">
        <SearchField value={query} onChange={setQuery} tabIndex={tab} />
      </div>
      <div className="flex min-h-0 flex-col gap-3 overflow-y-auto pb-2">
        {query.trim() ? (
          results.length ? (
            <ShapeRow label="Results" shapes={results} itemProps={itemProps} tabIndex={tab} />
          ) : (
            <div className="px-4">
              <NoMatches query={query} />
            </div>
          )
        ) : (
          <>
            {recents.length > 0 && <ShapeRow label="Recently used" shapes={recents.map((id) => getShape(id))} itemProps={itemProps} tabIndex={tab} />}
            {byCategory(results).map((group) => (
              <ShapeRow key={group.id} label={group.name} shapes={group.shapes} itemProps={itemProps} tabIndex={tab} />
            ))}
            <section aria-label="Structure" className="flex flex-col gap-1.5">
              <h3 className="px-4 text-xs font-semibold tracking-wide text-text-muted uppercase">Structure</h3>
              <div className="grid grid-cols-2 gap-2 px-4">
                <SwimlaneItems tabIndex={tab} onAdded={() => setOpen(false)} />
              </div>
            </section>
          </>
        )}
        <p className="px-4 text-xs text-text-muted">{HINT}</p>
      </div>
      {ghostElement}
    </div>
  )
}
