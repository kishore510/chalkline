import { Grid3x3, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Panel } from '@/components/ui/panel'
import type { Layout } from '@/hooks/useMediaQuery'
import { cn } from '@/lib/utils'
import { useUiStore } from '@/store/uiStore'
import type { GridDisplay } from '@/store/viewPrefs'
import { ToggleField } from './fields'

const GRID_OPTIONS: { value: GridDisplay; label: string }[] = [
  { value: 'dots', label: 'Dots' },
  { value: 'lines', label: 'Lines' },
  { value: 'off', label: 'Off' },
]

/** Dots / Lines / Off. Only changes what's drawn; snapping is separate. */
export function GridDisplayChoice() {
  const grid = useUiStore((s) => s.gridDisplay)
  const setViewPrefs = useUiStore((s) => s.setViewPrefs)
  return (
    <div role="group" aria-label="Grid display" className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-text">Grid display</span>
      <div className="grid grid-cols-3 gap-1">
        {GRID_OPTIONS.map((o) => (
          <Button
            key={o.value}
            variant="secondary"
            aria-pressed={o.value === grid}
            onClick={() => setViewPrefs({ grid: o.value })}
            className="px-2 aria-pressed:border-accent aria-pressed:bg-accent-subtle aria-pressed:text-accent"
          >
            {o.label}
          </Button>
        ))}
      </div>
    </div>
  )
}

/** Snap to grid, smart guides and grid display. Used by the View menu and the phone file menu. */
export function ViewOptions({ layout }: { layout: Layout }) {
  const snap = useUiStore((s) => s.snapToGrid)
  const guides = useUiStore((s) => s.smartGuides)
  const toggleSnap = useUiStore((s) => s.toggleSnap)
  const setViewPrefs = useUiStore((s) => s.setViewPrefs)
  return (
    <div className="flex flex-col gap-2 p-3">
      <ToggleField label={layout === 'desktop' ? 'Snap to grid (G)' : 'Snap to grid'} pressed={snap} onChange={toggleSnap} />
      <ToggleField label="Smart guides" pressed={guides} onChange={(smartGuides) => setViewPrefs({ smartGuides })} />
      {layout === 'desktop' && guides && <p className="-mt-1 text-xs text-text-muted">Hold Alt while dragging to turn guides off for a moment.</p>}
      <GridDisplayChoice />
    </div>
  )
}

/**
 * The View button (grid icon) and its menu. Desktop: a dropdown. Tablet: a
 * sheet from the bottom. The phone reaches the same options in the file menu.
 */
export function ViewMenu({ layout, className }: { layout: Layout; className?: string }) {
  const [open, setOpen] = useState(false)
  const snap = useUiStore((s) => s.snapToGrid)
  const panelRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (!panelRef.current?.contains(t) && !buttonRef.current?.contains(t)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      buttonRef.current?.focus()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const sheet = layout !== 'desktop'
  return (
    <div className="relative">
      <Button
        ref={buttonRef}
        variant="ghost"
        size="icon"
        aria-label={`View: snap to grid ${snap ? 'on' : 'off'}, guides and grid`}
        title="View: snap, guides and grid"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(snap && 'text-accent', className)}
      >
        <Grid3x3 />
      </Button>
      {open && (
        <Panel
          ref={panelRef}
          role="dialog"
          aria-label="View"
          className={cn(
            'pointer-events-auto z-40 shadow-lg',
            sheet ? 'cl-safe-bottom fixed inset-x-0 bottom-0 max-h-(--cl-sheet-max-height) overflow-y-auto rounded-b-none' : 'absolute top-full right-0 mt-1 w-72',
          )}
        >
          {sheet && (
            <div className="flex items-center justify-between pr-1 pl-3">
              <h2 className="text-sm font-semibold">View</h2>
              <Button variant="ghost" size="icon" aria-label="Close" onClick={() => setOpen(false)}>
                <X />
              </Button>
            </div>
          )}
          <ViewOptions layout={layout} />
        </Panel>
      )}
    </div>
  )
}
