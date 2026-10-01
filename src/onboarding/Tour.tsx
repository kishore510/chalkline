import { X } from 'lucide-react'
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { announce } from '@/a11y/announce'
import { Button } from '@/components/ui/button'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { readToken } from '@/lib/cssVar'
import { cn } from '@/lib/utils'
import { MEDIA } from '@/styles/breakpoints'
import quickStart from '@/help/topics/quick-start.md?raw'
import { useOnboardingStore } from './onboardingStore'
import { placeCard, type Box, type Placement } from './placement'
import { tourSteps, type TourStep } from './tourSteps'

/*
 * The tour of the three modes (loaded on first use). A card points at the mode
 * switch, then at each mode in turn. Not modal: the canvas stays usable, and
 * Escape or Skip ends it at any step. Each step is announced through the live
 * region and its title takes focus; on close, focus returns to where it was.
 * Positions move without animation under reduced motion (tokens are 0ms).
 */

const STEPS: TourStep[] = tourSteps(quickStart)

const selectorFor = (step: TourStep) => (step.target === 'modes' ? '[data-segmented="mode"]' : `[data-segmented="mode"] [data-value="${step.target}"]`)

/** The visible copy of the target (the toolbar can be in the top bar or floating). */
function findTarget(step: TourStep): HTMLElement | null {
  const all = Array.from(document.querySelectorAll<HTMLElement>(selectorFor(step)))
  return all.find((el) => el.getClientRects().length > 0) ?? null
}

const boxOf = (el: HTMLElement): Box => {
  const r = el.getBoundingClientRect()
  return { top: r.top, left: r.left, width: r.width, height: r.height }
}

export default function Tour() {
  const close = useOnboardingStore((s) => s.closeTour)
  const finePointer = useMediaQuery(MEDIA.finePointer)
  const [index, setIndex] = useState(0)
  const [target, setTarget] = useState<Box | null>(null)
  const [place, setPlace] = useState<Placement | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const opener = useRef<Element | null>(null)
  const titleId = useId()
  const bodyId = useId()
  const step = STEPS[index]
  const last = index === STEPS.length - 1

  const end = useCallback((finished: boolean) => close(finished), [close])

  // Focus returns to where it was when the tour ends.
  useEffect(() => {
    opener.current = document.activeElement
    return () => (opener.current as HTMLElement | null)?.focus?.()
  }, [])

  // No steps (Help's Quick start changed shape): nothing to show.
  useEffect(() => {
    if (!step) end(false)
  }, [step, end])

  // Each step: announce it and move focus to its title.
  useEffect(() => {
    if (!step) return
    announce(`Tour, step ${index + 1} of ${STEPS.length}: ${step.title}. ${step.body}`)
    titleRef.current?.focus()
  }, [index, step])

  // Follow the target as the layout changes (rotation, resize, text zoom).
  useEffect(() => {
    if (!step) return
    const measure = () => {
      const el = findTarget(step)
      setTarget(el ? boxOf(el) : null)
    }
    measure()
    window.addEventListener('resize', measure)
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(document.body)
    return () => {
      window.removeEventListener('resize', measure)
      observer?.disconnect()
    }
  }, [step])

  useLayoutEffect(() => {
    const card = cardRef.current
    if (!card) return
    const margin = readToken('--cl-gutter', 16)
    const viewport = { width: window.innerWidth, height: window.innerHeight }
    const size = { width: card.offsetWidth, height: card.offsetHeight }
    // Without a target (hidden for now), the card sits in the middle.
    const box = target ?? { top: viewport.height / 2, left: viewport.width / 2, width: 0, height: 0 }
    setPlace(placeCard(box, size, viewport, margin, margin))
  }, [target, index])

  // Escape ends the tour from anywhere (the tour isn't a focus trap).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      end(false)
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [end])

  if (!step) return null
  const ring = readToken('--cl-tour-ring-offset', 4)

  return createPortal(
    <>
      {target && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-50 rounded-lg outline-(length:--cl-tour-ring-width) outline-accent outline-solid transition-all motion-reduce:transition-none"
          style={{ top: target.top - ring, left: target.left - ring, width: target.width + ring * 2, height: target.height + ring * 2 }}
        />
      )}
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="false"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        className={cn(
          'fixed z-50 flex w-(--cl-tour-width) max-w-(--cl-tour-max-width) flex-col gap-3 rounded-lg border border-border bg-surface p-4 text-text shadow-lg transition-all motion-reduce:transition-none',
          !place && 'invisible',
        )}
        style={place ? { top: place.top, left: place.left } : { top: 0, left: 0 }}
      >
        <div className="flex items-start gap-2">
          <div className="flex min-w-0 flex-1 flex-col">
            <p className="text-xs text-text-muted">
              Step {index + 1} of {STEPS.length}
            </p>
            <h2 ref={titleRef} id={titleId} tabIndex={-1} className="text-base font-semibold outline-none">
              {step.title}
            </h2>
          </div>
          <Button variant="ghost" size="icon" aria-label="Close the tour" title="Close (Esc)" onClick={() => end(false)} className="-mt-2 -mr-2 shrink-0">
            <X />
          </Button>
        </div>
        <p id={bodyId} className="text-sm">
          {step.body}
          {step.shortcut && finePointer && <span className="text-text-muted"> Shortcut: {step.shortcut}.</span>}
        </p>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {!last && (
            <Button variant="ghost" className="mr-auto" onClick={() => end(false)}>
              Skip tour
            </Button>
          )}
          {index > 0 && (
            <Button variant="secondary" onClick={() => setIndex(index - 1)}>
              Back
            </Button>
          )}
          <Button variant="primary" onClick={() => (last ? end(true) : setIndex(index + 1))}>
            {last ? 'Done' : 'Next'}
          </Button>
        </div>
      </div>
    </>,
    document.body,
  )
}
