import { ArrowDown, ArrowRight, Loader2, Spline, Wand2, X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Panel } from '@/components/ui/panel'
import type { Layout } from '@/hooks/useMediaQuery'
import { cn } from '@/lib/utils'
import { useDiagramStore } from '@/store/diagramStore'
import { useUiStore, type ArrangePrefs } from '@/store/uiStore'
import { ToggleField } from './fields'
import { useTidy } from './useTidy'

function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: { value: T; label: string; icon?: ReactNode }[]
  onChange: (value: T) => void
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-text">{label}</span>
      <div className={cn('grid gap-1', options.length === 3 ? 'grid-cols-3' : 'grid-cols-2')}>
        {options.map((o) => (
          <Button
            key={o.value}
            variant="secondary"
            aria-pressed={o.value === value}
            onClick={() => onChange(o.value)}
            className="px-2 aria-pressed:border-accent aria-pressed:bg-accent-subtle aria-pressed:text-accent"
          >
            {o.icon}
            {o.label}
          </Button>
        ))}
      </div>
    </div>
  )
}

const DIRECTIONS: { value: ArrangePrefs['direction']; label: string; icon: ReactNode }[] = [
  { value: 'right', label: 'Left to right', icon: <ArrowRight /> },
  { value: 'down', label: 'Top to bottom', icon: <ArrowDown /> },
]
const SPACINGS: { value: ArrangePrefs['spacing']; label: string }[] = [
  { value: 'compact', label: 'Compact' },
  { value: 'normal', label: 'Normal' },
  { value: 'roomy', label: 'Roomy' },
]

function TidyPanel({ onDone }: { onDone: () => void }) {
  const prefs = useUiStore((s) => s.arrangePrefs)
  const setPrefs = useUiStore((s) => s.setArrangePrefs)
  const busy = useUiStore((s) => s.busy)
  const hasSelection = useDiagramStore((s) => s.selection.length > 0)
  const { arrange, tidyConnectors } = useTidy()
  const target = hasSelection ? 'selection' : 'diagram'
  return (
    <div className="flex flex-col gap-4 p-3">
      <section aria-label="Auto-arrange" className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold">Auto-arrange</h3>
        <Choice label="Direction" value={prefs.direction} options={DIRECTIONS} onChange={(direction) => setPrefs({ direction })} />
        <Choice label="Spacing" value={prefs.spacing} options={SPACINGS} onChange={(spacing) => setPrefs({ spacing })} />
        <Button
          variant="primary"
          disabled={Boolean(busy)}
          aria-busy={Boolean(busy)}
          onClick={() => {
            onDone()
            void arrange()
          }}
        >
          {busy ? <Loader2 className="animate-spin" /> : <Wand2 />}
          Arrange {target}
        </Button>
        <p className="text-xs text-text-muted">Swimlanes and locked items stay as they are. You can undo it.</p>
      </section>
      <div role="separator" className="h-px bg-border" />
      <section aria-label="Tidy connectors" className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">Tidy connectors</h3>
        <ToggleField label="Also clear pinned sides" pressed={prefs.clearPinned} onChange={(clearPinned) => setPrefs({ clearPinned })} />
        <Button
          variant="secondary"
          onClick={() => {
            onDone()
            tidyConnectors()
          }}
        >
          <Spline />
          Tidy connectors{hasSelection ? ' in selection' : ''}
        </Button>
      </section>
    </div>
  )
}

/**
 * The Tidy button and its menu. Desktop: a dropdown under the top bar.
 * Phone and tablet: a sheet from the bottom. Select mode only.
 */
export function TidyMenu({ layout, className }: { layout: Layout; className?: string }) {
  const [open, setOpen] = useState(false)
  const enabled = useUiStore((s) => s.tool === 'select')
  const busy = useUiStore((s) => s.busy)
  const panelRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!enabled) setOpen(false)
  }, [enabled])

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
        size={layout === 'desktop' ? 'default' : 'icon'}
        aria-label="Tidy: auto-arrange and tidy connectors"
        aria-haspopup="dialog"
        aria-expanded={open}
        title={enabled ? 'Tidy' : 'Tidy (Select mode only)'}
        disabled={!enabled}
        onClick={() => setOpen((v) => !v)}
        className={className}
      >
        {busy ? <Loader2 className="animate-spin" /> : <Wand2 />}
        {layout === 'desktop' && 'Tidy'}
      </Button>
      {open && (
        <Panel
          ref={panelRef}
          role="dialog"
          aria-label="Tidy"
          className={cn(
            'pointer-events-auto z-40 shadow-lg',
            sheet ? 'cl-safe-bottom fixed inset-x-0 bottom-0 max-h-(--cl-sheet-max-height) overflow-y-auto rounded-b-none' : 'absolute top-full right-0 mt-1 w-80',
          )}
        >
          {sheet && (
            <div className="flex items-center justify-between pr-1 pl-3">
              <h2 className="text-sm font-semibold">Tidy</h2>
              <Button variant="ghost" size="icon" aria-label="Close" onClick={() => setOpen(false)}>
                <X />
              </Button>
            </div>
          )}
          <TidyPanel onDone={() => setOpen(false)} />
        </Panel>
      )}
    </div>
  )
}

/** A small "Arranging…" chip while layout runs, so the wait is visible. */
export function BusyIndicator() {
  const busy = useUiStore((s) => s.busy)
  if (!busy) return null
  return (
    <div className="pointer-events-none absolute inset-x-0 top-10 z-20 flex justify-center px-4" role="status" aria-live="polite">
      <div className="flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-sm font-medium text-text shadow-md">
        <Loader2 className="size-4 animate-spin text-accent" aria-hidden="true" />
        {busy}
      </div>
    </div>
  )
}
