import { ArrowLeft, X } from 'lucide-react'
import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/button'
import { useFocusTrap } from '@/components/ui/useFocusTrap'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { cn } from '@/lib/utils'
import { MEDIA } from '@/styles/breakpoints'
import { useAiSheet, type AiMode } from './GenerateEntry'
import { describeTotal, describeUsage, useUsageStore } from './usage'

/*
 * The AI sheet's frame, shared by Generate, Summarise, Review and Notes: a bottom sheet on
 * phones, a side sheet from tablet up (like Settings), with a header (Back,
 * title, Close), a focus trap and a body that scrolls on its own.
 */

/** Long labels wrap instead of being cut off at large text sizes. */
export const WRAP = 'h-auto min-h-touch justify-start py-2 text-left whitespace-normal'

export function AiSheetFrame({
  title,
  icon,
  back,
  busy,
  onEscape,
  onClose,
  bodyRef,
  titleRef,
  children,
}: {
  title: string
  /** Shown in place of Back on a mode's first page. */
  icon: ReactNode
  back?: () => void
  /** A request is in flight: the backdrop doesn't close the sheet. */
  busy: boolean
  onEscape: () => void
  onClose: () => void
  bodyRef: RefObject<HTMLDivElement | null>
  titleRef: RefObject<HTMLHeadingElement | null>
  children: ReactNode
}) {
  const side = useMediaQuery(MEDIA.tablet)
  const ref = useRef<HTMLDivElement>(null)
  const titleId = useId()
  useFocusTrap(ref, onEscape)

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end bg-overlay md:items-stretch md:justify-end" onPointerDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-busy={busy}
        className={cn(
          'flex w-full flex-col border-border bg-surface text-text shadow-lg',
          side ? 'cl-safe-top h-full max-w-(--cl-ai-sheet-width) border-l' : 'h-(--cl-full-sheet-height) rounded-t-lg border-t',
        )}
      >
        <div className="flex min-h-touch shrink-0 items-center gap-1 border-b border-border px-1">
          {back ? (
            <Button variant="ghost" size="icon" aria-label="Back" title="Back" onClick={back}>
              <ArrowLeft />
            </Button>
          ) : (
            <span aria-hidden="true" className="flex size-touch items-center justify-center text-text-muted [&_svg]:size-5">
              {icon}
            </span>
          )}
          <h2 ref={titleRef} id={titleId} tabIndex={-1} className="min-w-0 flex-1 truncate text-sm font-semibold outline-none">
            {title}
          </h2>
          <Button variant="ghost" size="icon" aria-label="Close" title="Close (Esc)" onClick={onClose}>
            <X />
          </Button>
        </div>
        <div ref={bodyRef} className="cl-safe-bottom flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-4 pt-0 pb-4">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** New page: back to the top, and focus its first control (or its title) so it is announced. Not on first show. */
export function usePageFocus(page: string, bodyRef: RefObject<HTMLDivElement | null>, titleRef: RefObject<HTMLHeadingElement | null>) {
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    bodyRef.current?.scrollTo({ top: 0 })
    ;(bodyRef.current?.querySelector<HTMLElement>('[data-autofocus]') ?? titleRef.current)?.focus()
  }, [page, bodyRef, titleRef])
}

const MODES: { id: AiMode; label: string }[] = [
  { id: 'generate', label: 'Generate' },
  { id: 'summarise', label: 'Summarise' },
  { id: 'review', label: 'Review' },
  { id: 'notes', label: 'Notes' },
]

/** Generate, Summarise, Review or Notes, on each mode's first page. */
export function ModeSwitch() {
  const mode = useAiSheet((s) => s.mode)
  const setMode = useAiSheet((s) => s.setMode)
  return (
    <div role="group" aria-label="AI action" className="grid grid-cols-(--cl-ai-mode-columns) gap-1 rounded-md border border-border bg-surface-muted p-1">
      {MODES.map((m) => (
        <button
          key={m.id}
          type="button"
          aria-pressed={mode === m.id}
          data-mode={m.id}
          onClick={() => setMode(m.id)}
          className={cn(
            'min-h-touch rounded-sm px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
            mode === m.id ? 'bg-surface text-text shadow-sm' : 'text-text-muted hover:text-text',
          )}
        >
          {m.label}
        </button>
      ))}
    </div>
  )
}

/** The last request's model and token counts, and this visit's total. Nothing when the API reported no usage. */
export function UsageLine() {
  const last = useUsageStore((s) => s.last)
  const total = useUsageStore((s) => s.total)
  if (!last && total.requests === 0) return null
  return (
    <div className="flex flex-col gap-0.5 text-xs text-text-muted tabular-nums">
      {last && <p>Last request: {describeUsage(last)}</p>}
      {total.requests > 0 && <p>{describeTotal(total)} Counts from Anthropic’s API; no prices.</p>}
    </div>
  )
}
