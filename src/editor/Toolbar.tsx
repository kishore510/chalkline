import { Grid3x3, Hand, Link2, Maximize, MousePointer2, Plus, Redo2, Trash2, Undo2, ZoomIn, ZoomOut } from 'lucide-react'
import { useCanvasActions } from '@/canvas/useCanvasActions'
import { Button } from '@/components/ui/button'
import { Panel } from '@/components/ui/panel'
import { Segmented } from '@/components/ui/segmented'
import type { Layout } from '@/hooks/useMediaQuery'
import { cn } from '@/lib/utils'
import { useDiagramStore } from '@/store/diagramStore'
import { useUiStore, type Tool } from '@/store/uiStore'
import { deleteSelectionWithNotice } from './deleteSelection'
import { LayersButton } from './LayersPanel'
import { TidyMenu } from './TidyMenu'

const TOOL_OPTIONS: { value: Tool; label: string; icon: React.ReactNode }[] = [
  { value: 'select', label: 'Select and move (V)', icon: <MousePointer2 /> },
  { value: 'pan', label: 'Pan (H)', icon: <Hand /> },
  { value: 'link', label: 'Link: tap source, then target (L)', icon: <Link2 /> },
]

export function SnapButton({ className }: { className?: string }) {
  const snap = useUiStore((s) => s.snapToGrid)
  const toggleSnap = useUiStore((s) => s.toggleSnap)
  return (
    <Button variant="ghost" size="icon" aria-label="Snap to grid (G)" title="Snap to grid (G)" aria-pressed={snap} onClick={toggleSnap} className={className}>
      <Grid3x3 />
    </Button>
  )
}

export function HistoryButtons({ className }: { className?: string }) {
  const canUndo = useDiagramStore((s) => s.canUndo)
  const canRedo = useDiagramStore((s) => s.canRedo)
  const undo = useDiagramStore((s) => s.undo)
  const redo = useDiagramStore((s) => s.redo)
  return (
    <>
      <Button variant="ghost" size="icon" aria-label="Undo (Ctrl Z)" title="Undo (Ctrl Z)" disabled={!canUndo} onClick={undo} className={className}>
        <Undo2 />
      </Button>
      <Button variant="ghost" size="icon" aria-label="Redo (Ctrl Shift Z)" title="Redo (Ctrl Shift Z)" disabled={!canRedo} onClick={redo} className={className}>
        <Redo2 />
      </Button>
    </>
  )
}

/**
 * Canvas commands. The mode switch sits at one end and delete at the other,
 * behind a divider, so a mis-tap on Link can never hit delete.
 * Phone: floating pill (snap lives in the top bar, pinch zooms).
 * Tablet: floating with zoom buttons. Desktop: inline in the top bar.
 */
export function CanvasToolbar({ layout }: { layout: Layout }) {
  const actions = useCanvasActions()
  const tool = useUiStore((s) => s.tool)
  const setTool = useUiStore((s) => s.setTool)
  const openPalette = useUiStore((s) => s.setPaletteOpen)
  const hasSelection = useDiagramStore((s) => s.selection.length > 0)
  const floating = layout !== 'desktop'
  const round = cn(floating && 'rounded-full')

  const content = (
    <>
      {layout !== 'phone' && (
        <>
          <HistoryButtons className={round} />
          <div aria-hidden="true" className="mx-1 h-6 w-px shrink-0 bg-border" />
        </>
      )}
      <Segmented label="Canvas mode" options={TOOL_OPTIONS} value={tool} onChange={setTool} className={round} />
      {layout === 'phone' && (
        <Button variant="primary" size="icon" aria-label="Add shape" className="rounded-full" onClick={() => openPalette(true)}>
          <Plus />
        </Button>
      )}
      {layout !== 'phone' && <SnapButton className={round} />}
      {layout !== 'phone' && (
        <>
          <Button variant="ghost" size="icon" aria-label="Zoom out (-)" title="Zoom out (-)" onClick={actions.zoomOut} className={round}>
            <ZoomOut />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Zoom in (+)" title="Zoom in (+)" onClick={actions.zoomIn} className={round}>
            <ZoomIn />
          </Button>
        </>
      )}
      <Button variant="ghost" size="icon" aria-label="Fit to screen (F)" title="Fit to screen (F)" onClick={actions.fitView} className={round}>
        <Maximize />
      </Button>
      {layout !== 'phone' && <TidyMenu layout={layout} className={round} />}
      {layout !== 'phone' && <LayersButton layout={layout} className={round} />}
      <div aria-hidden="true" className="mx-1 h-6 w-px shrink-0 bg-border" />
      <Button
        variant="ghost"
        size="icon"
        aria-label="Delete selection (Del)"
        title="Delete selection (Del)"
        disabled={!hasSelection}
        onClick={deleteSelectionWithNotice}
        className={cn('text-danger', round)}
      >
        <Trash2 />
      </Button>
    </>
  )

  if (!floating) {
    return (
      <div role="toolbar" aria-label="Canvas" className="flex items-center gap-1">
        {content}
      </div>
    )
  }
  return (
    <Panel role="toolbar" aria-label="Canvas" className="pointer-events-auto flex items-center gap-1 rounded-full p-1 shadow-lg">
      {content}
    </Panel>
  )
}
