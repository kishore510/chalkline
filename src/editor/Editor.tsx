import { ReactFlowProvider } from '@xyflow/react'
import { Canvas } from '@/canvas/Canvas'
import { useMediaQuery, type Layout } from '@/hooks/useMediaQuery'
import { useDiagramStore } from '@/store/diagramStore'
import { MEDIA } from '@/styles/breakpoints'
import { ContextMenu } from './ContextMenu'
import { EmptyCanvas } from './EmptyCanvas'
import { PaletteDrawer, PalettePanel, PaletteRail } from './palette'
import { PropertiesPanel, PropertiesSheet, PropertiesSlideOver } from './Properties'
import { CanvasToolbar } from './Toolbar'
import { TopBar } from './TopBar'
import { useShortcuts } from './useShortcuts'

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

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-bg text-text">
      <TopBar layout={layout} />
      <div className="relative flex min-h-0 flex-1">
        {layout === 'desktop' && <PalettePanel />}
        {layout === 'tablet' && <PaletteRail />}
        <main className="relative min-w-0 flex-1 overflow-hidden">
          <Canvas showMinimap={layout !== 'phone'} />
          <EmptyCanvas layout={layout} />
          {layout !== 'desktop' && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-3">
              <div className={layout === 'phone' ? 'px-4' : 'cl-safe-bottom px-4'}>
                <CanvasToolbar layout={layout} />
              </div>
              {layout === 'phone' && <PhoneBottom />}
            </div>
          )}
          {layout === 'tablet' && <PropertiesSlideOver />}
        </main>
        {layout === 'desktop' && <PropertiesPanel />}
      </div>
      {layout === 'phone' && <PaletteDrawer />}
      <ContextMenu />
    </div>
  )
}

/** Phone: the properties sheet when something is selected, otherwise safe-area spacing under the toolbar. */
function PhoneBottom() {
  const open = useDiagramStore((s) => s.selection.length > 0)
  return open ? <PropertiesSheet /> : <div className="cl-safe-bottom" />
}

export function Editor() {
  return (
    <ReactFlowProvider>
      <EditorLayout />
    </ReactFlowProvider>
  )
}
