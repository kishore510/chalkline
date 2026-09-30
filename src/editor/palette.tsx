import { ChevronsLeft, ChevronsRight, Columns3, LayoutTemplate, Rows3, Search, X } from 'lucide-react'
import { useMemo, useRef, useState, type ComponentProps } from 'react'
import { createPortal } from 'react-dom'
import { useCanvasActions } from '@/canvas/useCanvasActions'
import { ShapeIcon } from '@/components/shapes/ShapeIcon'
import { Button } from '@/components/ui/button'
import { readToken } from '@/lib/cssVar'
import { cn } from '@/lib/utils'
import { getShape } from '@/shapes/registry'
import type { ShapeDefinition } from '@/shapes/types'
import { byCategory, searchShapes } from './paletteModel'
import { clampPaletteWidth, loadPalettePrefs, maxPaletteWidth, savePalettePrefs, shouldCollapse, type PalettePrefs } from './paletteWidth'
import { useUiStore } from '@/store/uiStore'
import { StencilBrowser } from './stencils/StencilBrowser'

// Distance (CSS px) a pointer must travel before a press becomes a drag.
const DRAG_THRESHOLD = 6

/** Axis the list around an item scrolls along; `xy` when both (the phone drawer). */
type ScrollAxis = 'x' | 'y' | 'xy'

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
function usePaletteGestures({
  onAdded,
  onDragStart,
  onDragEnd,
}: {
  onAdded?: () => void
  onDragStart?: () => void
  onDragEnd?: () => void
}) {
  const noteShapeUsed = useUiStore((s) => s.noteShapeUsed)
  const actions = useCanvasActions()
  const [ghost, setGhost] = useState<Ghost | null>(null)
  const hooks = useRef({ onAdded, onDragStart, onDragEnd })
  hooks.current = { onAdded, onDragStart, onDragEnd }

  /**
   * On touch and pen a move along the list's scroll axis is left to the browser
   * as a scroll; only a move across it pulls the shape out. Where the list
   * scrolls both ways (`xy`), press and hold picks the shape up instead. A mouse
   * drags in any direction.
   */
  const itemProps = (type: string, scroll: ScrollAxis = 'y') => ({
    onPointerDown(e: React.PointerEvent) {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      const touch = e.pointerType !== 'mouse'
      const start = { x: e.clientX, y: e.clientY }
      let dragging = false

      const beginDrag = (x: number, y: number) => {
        dragging = true
        hooks.current.onDragStart?.()
        setGhost({ type, x, y })
      }
      // Once a held shape is picked up, keep the browser from scrolling under it.
      const blockScroll = (ev: TouchEvent) => {
        if (dragging && ev.cancelable) ev.preventDefault()
      }
      const hold = touch && scroll === 'xy' ? window.setTimeout(() => beginDrag(start.x, start.y), readToken('--cl-long-press', 500)) : 0

      const stop = () => {
        window.clearTimeout(hold)
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', end)
        window.removeEventListener('pointercancel', end)
        window.removeEventListener('touchmove', blockScroll)
        setGhost(null)
        if (dragging) hooks.current.onDragEnd?.()
      }
      const move = (ev: PointerEvent) => {
        if (ev.pointerId !== e.pointerId) return
        if (dragging) {
          setGhost({ type, x: ev.clientX, y: ev.clientY })
          return
        }
        const dx = Math.abs(ev.clientX - start.x)
        const dy = Math.abs(ev.clientY - start.y)
        if (Math.hypot(dx, dy) <= DRAG_THRESHOLD) return
        const alongScroll = scroll === 'xy' || (scroll === 'x' ? dx >= dy : dy >= dx)
        if (touch && alongScroll) {
          // The user is scrolling the list: neither a drag nor a tap.
          stop()
          return
        }
        beginDrag(ev.clientX, ev.clientY)
      }
      const end = (ev: PointerEvent) => {
        if (ev.pointerId !== e.pointerId) return
        stop()
        if (ev.type === 'pointercancel') return
        const added = dragging ? actions.addAtScreenPoint(type, ev.clientX, ev.clientY) : (actions.addAtCenter(type), true)
        if (!added) return
        noteShapeUsed(type)
        hooks.current.onAdded?.()
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', end)
      window.addEventListener('pointercancel', end)
      if (hold) window.addEventListener('touchmove', blockScroll, { passive: false })
    },
    onContextMenu(e: React.MouseEvent) {
      // Press and hold drags; don't let the browser open its own menu.
      if (scroll === 'xy') e.preventDefault()
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
}: { shape: string; compact?: boolean; scroll?: ScrollAxis } & Omit<ComponentProps<'button'>, 'type'>) {
  return (
    <button
      type="button"
      title={`Add ${getShape(shape).name.toLowerCase()}`}
      aria-label={`Add ${getShape(shape).name.toLowerCase()}`}
      className={cn(
        'flex min-h-touch items-center gap-3 rounded-md text-sm text-text transition-colors select-none',
        scroll === 'xy' ? 'touch-manipulation [-webkit-touch-callout:none]' : scroll === 'x' ? 'touch-pan-x' : 'touch-pan-y',
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
const HOLD_HINT = 'Tap to add, or press and hold to drag onto the canvas.'

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

type PaletteView = 'shapes' | 'stencils'

/** Shapes or Stencils: which half of the palette is showing. */
function PaletteTabs({ value, onChange, tabIndex }: { value: PaletteView; onChange: (value: PaletteView) => void; tabIndex?: number }) {
  const tab = (view: PaletteView, label: string) => (
    <button
      type="button"
      role="tab"
      tabIndex={tabIndex}
      aria-selected={value === view}
      onClick={() => onChange(view)}
      className={cn(
        'min-h-touch flex-1 rounded-sm text-sm font-medium transition-colors',
        value === view ? 'bg-surface text-text shadow-sm' : 'text-text-muted hover:text-text',
      )}
    >
      {label}
    </button>
  )
  return (
    <div role="tablist" aria-label="Palette" className="flex shrink-0 gap-1 rounded-md bg-surface-muted p-1">
      {tab('shapes', 'Shapes')}
      {tab('stencils', 'Stencils')}
    </div>
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
  /** 'fill': as many columns as fit (the resizable desktop panel). */
  columns?: 2 | 3 | 'fill'
  tabIndex?: number
}) {
  const results = searchShapes(query)
  const grid = cn('grid gap-2', columns === 3 ? 'grid-cols-3' : columns === 2 && 'grid-cols-2')
  const gridStyle = columns === 'fill' ? FILL_COLUMNS : undefined
  if (query.trim()) {
    return results.length ? (
      <div className={grid} style={gridStyle}>
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
          <div className={grid} style={gridStyle}>
            {group.shapes.map((s) => (
              <PaletteItem key={s.id} shape={s.id} tabIndex={tabIndex} {...itemProps(s.id)} />
            ))}
          </div>
        </section>
      ))}
    </>
  )
}

const FILL_COLUMNS = { gridTemplateColumns: 'repeat(auto-fill, minmax(var(--cl-palette-item-min), 1fr))' }

/** Collapsed palette: one column of shape icons (tap or drag to add), then stencils. */
function CompactPalette({ itemProps, onStencils }: { itemProps: (type: string) => object; onStencils: () => void }) {
  return (
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
      <div aria-hidden="true" className="my-1 h-px w-8 bg-border" />
      <Button variant="ghost" size="icon" aria-label="Stencils" title="Stencils" onClick={onStencils}>
        <LayoutTemplate />
      </Button>
    </>
  )
}

const KEY_STEP = 16

/**
 * The palette's right edge: drag (mouse, pen or touch) or use the arrow keys
 * to resize. Released well below the minimum, the palette collapses.
 * Double-click restores the default width.
 */
function PaletteResizer({
  width,
  min,
  max,
  onResize,
  onCommit,
  onCollapse,
  onReset,
}: {
  width: number
  min: number
  max: number
  onResize: (width: number) => void
  onCommit: (width: number) => void
  onCollapse: () => void
  onReset: () => void
}) {
  const drag = useRef<{ pointerId: number; x: number; width: number; raw: number } | null>(null)
  const [active, setActive] = useState(false)
  const end = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || d.pointerId !== e.pointerId) return
    drag.current = null
    setActive(false)
    if (shouldCollapse(d.raw, min)) {
      onResize(d.width)
      onCollapse()
    } else {
      onCommit(clampPaletteWidth(d.raw, min, max))
    }
  }
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize palette"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={width}
      title="Drag to resize. Double-click for the default width."
      tabIndex={0}
      className="group absolute inset-y-0 right-0 z-10 flex w-(--cl-palette-resize-hit) translate-x-1/2 cursor-col-resize touch-none justify-center outline-none"
      onPointerDown={(e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return
        e.preventDefault()
        e.currentTarget.setPointerCapture(e.pointerId)
        drag.current = { pointerId: e.pointerId, x: e.clientX, width, raw: width }
        setActive(true)
      }}
      onPointerMove={(e) => {
        const d = drag.current
        if (!d || d.pointerId !== e.pointerId) return
        d.raw = d.width + e.clientX - d.x
        onResize(clampPaletteWidth(d.raw, min, max))
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onDoubleClick={onReset}
      onKeyDown={(e) => {
        const next =
          e.key === 'ArrowLeft' ? width - KEY_STEP : e.key === 'ArrowRight' ? width + KEY_STEP : e.key === 'Home' ? min : e.key === 'End' ? max : null
        if (next === null) return
        e.preventDefault()
        onCommit(clampPaletteWidth(next, min, max))
      }}
    >
      <div
        aria-hidden="true"
        className={cn(
          'h-full w-0.5 transition-colors group-hover:bg-accent group-focus-visible:bg-accent',
          active ? 'bg-accent' : 'bg-transparent',
        )}
      />
    </div>
  )
}

/**
 * Desktop: persistent left panel with search and category headings. Its
 * width can be dragged or set with the keyboard, and it can collapse to an
 * icon rail; both are remembered.
 */
export function PalettePanel() {
  const [query, setQuery] = useState('')
  const [view, setView] = useState<PaletteView>('shapes')
  const { itemProps, ghostElement } = usePaletteGestures({})
  const [prefs, setPrefs] = useState(loadPalettePrefs)
  const limits = useMemo(() => {
    const min = readToken('--cl-palette-min-width', 200)
    return { min, max: maxPaletteWidth(min, readToken('--cl-palette-max-width', 480), window.innerWidth), initial: readToken('--cl-palette-width', 224) }
  }, [])
  // Live width while dragging; saved on release.
  const [liveWidth, setLiveWidth] = useState<number | null>(null)
  const width = liveWidth ?? clampPaletteWidth(prefs.width ?? limits.initial, limits.min, limits.max)

  const update = (next: PalettePrefs) => {
    setPrefs(next)
    setLiveWidth(null)
    savePalettePrefs(next)
  }

  if (prefs.collapsed) {
    return (
      <aside aria-label="Shapes" className="flex w-rail shrink-0 flex-col items-center gap-2 overflow-y-auto border-r border-border bg-surface py-2">
        <Button variant="ghost" size="icon" aria-label="Expand palette" title="Expand palette" aria-expanded={false} onClick={() => update({ ...prefs, collapsed: false })}>
          <ChevronsRight />
        </Button>
        <CompactPalette
          itemProps={itemProps}
          onStencils={() => {
            setView('stencils')
            update({ ...prefs, collapsed: false })
          }}
        />
        {ghostElement}
      </aside>
    )
  }

  return (
    <aside aria-label={view === 'stencils' ? 'Stencils' : 'Shapes'} className="relative flex shrink-0 border-r border-border bg-surface" style={{ width }}>
      <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        <div className="flex items-center gap-1">
          <div className="min-w-0 flex-1">
            <PaletteTabs value={view} onChange={setView} />
          </div>
          <Button variant="ghost" size="icon" aria-label="Collapse palette" title="Collapse palette" aria-expanded={true} onClick={() => update({ ...prefs, collapsed: true })}>
            <ChevronsLeft />
          </Button>
        </div>
        {view === 'stencils' ? (
          <StencilBrowser />
        ) : (
          <>
            <SearchField value={query} onChange={setQuery} />
            <ShapeSections query={query} itemProps={itemProps} columns="fill" />
            <p className="text-xs text-text-muted">{HINT}</p>
            {!query.trim() && (
              <section aria-label="Structure" className="flex flex-col gap-2">
                <h3 className="text-xs font-semibold tracking-wide text-text-muted uppercase">Structure</h3>
                <div className="grid grid-cols-2 gap-2">
                  <SwimlaneItems />
                </div>
              </section>
            )}
          </>
        )}
      </div>
      <PaletteResizer
        width={width}
        min={limits.min}
        max={limits.max}
        onResize={setLiveWidth}
        onCommit={(w) => update({ ...prefs, width: w })}
        onCollapse={() => update({ ...prefs, collapsed: true })}
        onReset={() => update({ ...prefs, width: null })}
      />
      {ghostElement}
    </aside>
  )
}

/** Tablet: icon rail that expands to show names, search and categories. */
export function PaletteRail() {
  const [expanded, setExpanded] = useState(false)
  const [view, setView] = useState<PaletteView>('shapes')
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
          <PaletteTabs value={view} onChange={setView} />
          {view === 'stencils' ? (
            <StencilBrowser />
          ) : (
            <>
              <SearchField value={query} onChange={setQuery} />
              <ShapeSections query={query} itemProps={itemProps} />
              <p className="text-xs text-text-muted">{HINT}</p>
              <div className="grid grid-cols-2 gap-2">
                <SwimlaneItems />
              </div>
            </>
          )}
        </>
      ) : (
        <CompactPalette
          itemProps={itemProps}
          onStencils={() => {
            setView('stencils')
            setExpanded(true)
          }}
        />
      )}
      {ghostElement}
    </aside>
  )
}

/** A horizontally scrolling row of shapes (phone drawer). Press and hold picks a shape up to drag onto the canvas. */
function ShapeRow({
  label,
  shapes,
  itemProps,
  tabIndex,
}: {
  label: string
  shapes: ShapeDefinition[]
  itemProps: (type: string, scroll: ScrollAxis) => object
  tabIndex?: number
}) {
  return (
    <section aria-label={label} className="flex flex-col gap-1.5">
      <h3 className="px-4 text-xs font-semibold tracking-wide text-text-muted uppercase">{label}</h3>
      <div className="flex gap-2 overflow-x-auto px-4 pb-1">
        {shapes.map((s) => (
          <PaletteItem key={s.id} shape={s.id} scroll="xy" tabIndex={tabIndex} className="w-20 shrink-0" {...itemProps(s.id, 'xy')} />
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
  const [view, setView] = useState<PaletteView>('shapes')
  const [dragging, setDragging] = useState(false)
  const { itemProps, ghostElement } = usePaletteGestures({
    onDragStart: () => setDragging(true),
    // Fires on release and on pointercancel, so the drawer can never stay hidden.
    onDragEnd: () => setDragging(false),
    onAdded: () => setOpen(false),
  })
  const shown = open && !dragging
  const tab = open ? 0 : -1
  const results = searchShapes(query)

  return (
    <div
      role="dialog"
      aria-label="Add a shape"
      aria-hidden={!open}
      className={cn(
        'cl-safe-bottom fixed inset-x-0 bottom-0 z-30 flex max-h-(--cl-drawer-max-height) flex-col rounded-t-lg border-t border-border bg-surface shadow-lg transition-transform duration-(--cl-duration-base) ease-standard',
        shown ? 'translate-y-0' : 'translate-y-full',
        !open && 'invisible',
      )}
    >
      <div className="flex min-h-touch shrink-0 items-center justify-between gap-2 pr-2 pl-4">
        <h2 className="text-sm font-semibold">{view === 'stencils' ? 'Add a stencil' : 'Add a shape'}</h2>
        <Button variant="ghost" size="icon" aria-label="Close" onClick={() => setOpen(false)} tabIndex={tab}>
          <X />
        </Button>
      </div>
      <div className="shrink-0 px-4 pb-3">
        <PaletteTabs value={view} onChange={setView} tabIndex={tab} />
      </div>
      {view === 'stencils' ? (
        <div className="flex min-h-0 flex-col overflow-y-auto overscroll-contain px-4 pb-2">
          <StencilBrowser tabIndex={tab} onInserted={() => setOpen(false)} />
        </div>
      ) : (
        <>
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
            <p className="px-4 text-xs text-text-muted">{HOLD_HINT}</p>
          </div>
        </>
      )}
      {ghostElement}
    </div>
  )
}
