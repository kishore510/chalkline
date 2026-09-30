import { ReactFlowProvider } from '@xyflow/react'
import { useEffect } from 'react'
import { useCanvasActions } from '@/canvas/useCanvasActions'
import { fixtures } from '@/fixtures'
import { Canvas } from '@/canvas/Canvas'
import { useMediaQuery, type Layout } from '@/hooks/useMediaQuery'
import { HelpSheetHost, VersionTag } from '@/help/HelpEntry'
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
  useFixtureFromHash()

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-bg text-text">
      <TopBar layout={layout} />
      <div className="relative flex min-h-0 flex-1">
        {layout === 'desktop' && <PalettePanel />}
        {layout === 'tablet' && <PaletteRail />}
        <main className="relative min-w-0 flex-1 overflow-hidden">
          <Canvas minimap={layout === 'phone' ? 'none' : layout === 'desktop' ? 'bottom-right' : 'top-right'} />
          <EmptyCanvas layout={layout} />
          <LinkHint />
          <BusyIndicator />
          {layout === 'desktop' && <ArrangeBar />}
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
    </div>
  )
}

/** Phone: the properties sheet replaces the toolbar while something is selected. */
function PhoneBottom() {
  const open = useDiagramStore((s) => s.selection.length > 0)
  if (open) return <PropertiesSheet />
  return (
    <div className="cl-safe-bottom px-4">
      <CanvasToolbar layout="phone" />
    </div>
  )
}

/** `#/fixture/<name>` opens a sample diagram, e.g. #/fixture/label-cases for checking label layout. */
function useFixtureFromHash() {
  const actions = useCanvasActions()
  useEffect(() => {
    const name = window.location.hash.match(/^#\/fixture\/([\w-]+)$/)?.[1]
    const fixture = name ? fixtures[name] : undefined
    if (fixture) actions.load(fixture)
  }, [actions])
}

export function Editor() {
  return (
    <ReactFlowProvider>
      <EditorLayout />
    </ReactFlowProvider>
  )
}
