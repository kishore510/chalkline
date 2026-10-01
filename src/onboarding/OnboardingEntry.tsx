import { LayoutTemplate, Sparkles } from 'lucide-react'
import { lazy, Suspense } from 'react'
import { useCanvasActions } from '@/canvas/useCanvasActions'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { Panel } from '@/components/ui/panel'
import { loadSample } from '@/fixtures/load'
import { useStencilStore } from '@/stencils/stencilStore'
import { useOnboardingStore } from './onboardingStore'

/*
 * The always-loaded parts of onboarding: the first-run welcome on the empty
 * canvas, and the host that loads the tour when it's started.
 */

const Tour = lazy(() => import('./Tour'))

export function TourHost() {
  const open = useOnboardingStore((s) => s.tourOpen)
  if (!open) return null
  return (
    <Suspense fallback={null}>
      <Tour />
    </Suspense>
  )
}

/** First run only, on an empty canvas: two ways to get going, plus the tour. */
export function Welcome() {
  const actions = useCanvasActions()
  const { dismissWelcome, startTour } = useOnboardingStore.getState()
  return (
    <Panel className="pointer-events-auto max-w-sm bg-surface">
      <EmptyState
        title="Welcome to Chalkline"
        action={
          <div className="flex flex-col items-center gap-2">
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="primary" onClick={() => useStencilStore.getState().openDialog({ kind: 'templates' })}>
                <LayoutTemplate />
                Start from a template
              </Button>
              <Button variant="secondary" onClick={() => void loadSample('web-architecture').then((d) => d && actions.load(d))}>
                <Sparkles />
                Try a sample diagram
              </Button>
            </div>
            <div className="flex flex-wrap justify-center">
              <Button variant="ghost" className="text-accent" onClick={startTour}>
                Take a quick tour
              </Button>
              <Button variant="ghost" className="text-text-muted" onClick={dismissWelcome}>
                Start with a blank canvas
              </Button>
            </div>
          </div>
        }
      >
        Sketch architecture and ideas as diagrams. Everything stays in this browser.
      </EmptyState>
    </Panel>
  )
}
