import { ReactFlowProvider } from '@xyflow/react'
import { useEffect } from 'react'
import { LiveRegion } from '@/a11y/LiveRegion'
import { GenerateSheetHost } from '@/ai/GenerateEntry'
import { useCanvasActions } from '@/canvas/useCanvasActions'
import { useCanvasKeyboard } from '@/canvas/useCanvasKeyboard'
import { loadSample } from '@/fixtures/load'
import { Canvas } from '@/canvas/Canvas'
import { useMediaQuery, type Layout } from '@/hooks/useMediaQuery'
import { ErrorBanner, ErrorDialog, RenderErrorBoundary } from '@/errors/ErrorViews'
import { HelpSheetHost, VersionTag } from '@/help/HelpEntry'
import { TourHost } from '@/onboarding/OnboardingEntry'
import { saveJson } from '@/persistence/download'
import { createNewDiagram } from '@/settings/newDiagram'
import { SettingsSheetHost } from '@/settings/SettingsEntry'
import { cn } from '@/lib/utils'
import { SearchBar, SearchSheet } from '@/search/SearchPanel'
import { useSearchStore } from '@/search/searchStore'
import { useDiagramStore } from '@/store/diagramStore'
import { MEDIA } from '@/styles/breakpoints'
import { ArrangeBar } from './ArrangeControls'
import { ContextMenu } from './ContextMenu'
import { LayersSheet } from './LayersPanel'
import { EmptyCanvas } from './EmptyCanvas'
import { LinkHint } from './LinkHint'
import { Notice } from './Notice'
import { PaletteDrawer, PalettePanel, PaletteRail } from './palette'
import { PropertiesPanel, PropertiesSheet, PropertiesSlideOver } from './Properties'
import { CanvasToolbar } from './Toolbar'
import { BusyIndicator } from './TidyMenu'
import { TopBar } from './TopBar'
import { UndoToast } from './UndoToast'
import { useShortcuts } from './useShortcuts'
import { StencilDialogs } from './stencils/StencilDialogs'

/**
 * Adaptive editor layout.
 * Phone: full-screen canvas, floating toolbar, palette drawer, properties bottom sheet.
 * Tablet: collapsible palette rail, slide-over properties.
 * Desktop: persistent palette and properties panels, toolbar in the top bar.
 */
function EditorLayout() {
  const tablet = useMediaQuery(MEDIA.tablet)
  const desktop = useMediaQuery(MEDIA.desktop)
  const layout: Layout = desktop ? 'desktop' : tablet ? 'tablet' : 'phone'
  useShortcuts()
  useCanvasKeyboard()
  useFixtureFromHash()

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-bg text-text">
      <SkipToCanvas />
      <LiveRegion />
      <TopBar layout={layout} />
      <div className="relative flex min-h-0 flex-1">
        {layout === 'desktop' && <PalettePanel />}
        {layout === 'tablet' && <PaletteRail />}
        <main className="relative min-w-0 flex-1 overflow-hidden">
          <RenderErrorBoundary actions={RECOVERY}>
            <Canvas minimap={layout === 'phone' ? 'none' : layout === 'desktop' ? 'bottom-right' : 'top-right'} />
            <EmptyCanvas layout={layout} />
          </RenderErrorBoundary>
          {/* One column at the top, so these never overlap. Phone sits lower, clear of the corner credit. */}
          <div className={cn('pointer-events-none absolute inset-x-0 z-10 flex flex-col items-center gap-2 px-4', layout === 'phone' ? 'top-10' : 'top-3')}>
            <ErrorBanner />
            {layout !== 'phone' && <SearchBar />}
            {layout === 'desktop' && <ArrangeBar />}
            <LinkHint />
          </div>
          <BusyIndicator />
          {layout === 'desktop' && (
            <div className="pointer-events-none absolute bottom-0 left-0 z-10 p-1">
              <VersionTag />
            </div>
          )}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-3">
            <Notice />
            <UndoToast />
            {layout === 'phone' && <PhoneBottom />}
            {layout === 'tablet' && (
              <div className="cl-safe-bottom px-4">
                <CanvasToolbar layout={layout} />
              </div>
            )}
            {layout === 'desktop' && <div className="cl-safe-bottom" />}
          </div>
          {layout === 'tablet' && <PropertiesSlideOver />}
        </main>
        {layout === 'desktop' && <PropertiesPanel />}
      </div>
      {layout === 'phone' && <PaletteDrawer />}
      {layout !== 'desktop' && <LayersSheet />}
      <ContextMenu />
      <StencilDialogs />
      <HelpSheetHost />
      <SettingsSheetHost />
      <GenerateSheetHost />
      <ErrorDialog />
      <TourHost />
    </div>
  )
}

/** Ways out when the canvas can't draw the diagram: keep the data, or start over (undo brings it back). */
const RECOVERY = [
  { label: 'Export JSON', run: () => void saveJson(), primary: true },
  { label: 'Start a new diagram', run: () => useDiagramStore.getState().load(createNewDiagram()) },
]

/** First Tab stop on the page (shown when focused): straight to the canvas, past the top bar and palette. */
function SkipToCanvas() {
  return (
    <a
      href="#canvas"
      onClick={(e) => {
        e.preventDefault()
        document.querySelector<HTMLElement>('.react-flow')?.focus()
      }}
      className="sr-only z-50 rounded-md bg-surface px-4 text-sm font-medium text-text shadow-lg focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:flex focus:min-h-touch focus:items-center"
    >
      Skip to canvas
    </a>
  )
}

/** Phone: the properties sheet (while something is selected) or the search sheet replaces the toolbar. */
function PhoneBottom() {
  const open = useDiagramStore((s) => s.selection.length > 0)
  const searching = useSearchStore((s) => s.open)
  if (open) return <PropertiesSheet />
  if (searching) return <SearchSheet />
  return (
    <div className="cl-safe-bottom px-(--cl-gutter)">
      <CanvasToolbar layout="phone" />
    </div>
  )
}

/**
 * `#/fixture/<name>` opens a sample diagram, e.g. #/fixture/label-cases for
 * checking label layout, or #/fixture/stress-1000 for a generated 1000-shape
 * diagram. Samples load on demand, so they aren't part of the app download.
 */
function useFixtureFromHash() {
  const actions = useCanvasActions()
  useEffect(() => {
    const name = window.location.hash.match(/^#\/fixture\/([\w-]+)$/)?.[1]
    if (!name) return
    let live = true
    void loadSample(name).then((diagram) => live && diagram && actions.load(diagram))
    return () => {
      live = false
    }
  }, [actions])
}

export function Editor() {
  return (
    <ReactFlowProvider>
      <EditorLayout />
    </ReactFlowProvider>
  )
}
