import { LayoutTemplate, Plus, Sparkles } from 'lucide-react'
import { useCanvasActions } from '@/canvas/useCanvasActions'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { Panel } from '@/components/ui/panel'
import type { Layout } from '@/hooks/useMediaQuery'
import { loadSample } from '@/fixtures/load'
import { Welcome } from '@/onboarding/OnboardingEntry'
import { useOnboardingStore } from '@/onboarding/onboardingStore'
import { useDiagramStore } from '@/store/diagramStore'
import { useUiStore } from '@/store/uiStore'
import { useStencilStore } from '@/stencils/stencilStore'

/** Shown over the canvas while the diagram has no shapes. */
export function EmptyCanvas({ layout }: { layout: Layout }) {
  const empty = useDiagramStore((s) => s.diagram.nodes.length === 0)
  const welcome = useOnboardingStore((s) => s.welcome)
  const actions = useCanvasActions()
  if (!empty) return null
  if (welcome) {
    return (
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-4">
        <Welcome />
      </div>
    )
  }
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-4">
      <Panel className="pointer-events-auto max-w-sm bg-surface">
        <EmptyState
          title="Start with a shape"
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {layout === 'phone' && (
                <Button variant="primary" onClick={() => useUiStore.getState().setPaletteOpen(true)}>
                  <Plus />
                  Add shape
                </Button>
              )}
              <Button variant={layout === 'phone' ? 'secondary' : 'primary'} onClick={() => useStencilStore.getState().openDialog({ kind: 'templates' })}>
                <LayoutTemplate />
                Start from a template
              </Button>
              <Button variant="secondary" onClick={() => void loadSample('web-architecture').then((d) => d && actions.load(d))}>
                <Sparkles />
                Load an example
              </Button>
            </div>
          }
        >
          {layout === 'phone'
            ? 'Tap Add shape, then drag from a shape’s edge dots to connect it to another.'
            : 'Tap a shape in the palette or drag it onto the canvas. Drag from the edge dots to connect shapes.'}
        </EmptyState>
      </Panel>
    </div>
  )
}
