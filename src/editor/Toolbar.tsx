import { Grid3x3, Hand, Maximize, MousePointer2, Plus, Trash2, ZoomIn, ZoomOut } from 'lucide-react'
import { useCanvasActions } from '@/canvas/useCanvasActions'
import { Button } from '@/components/ui/button'
import { Panel } from '@/components/ui/panel'
import { Segmented } from '@/components/ui/segmented'
import type { Layout } from '@/hooks/useMediaQuery'
import { cn } from '@/lib/utils'
import { useDiagramStore } from '@/store/diagramStore'
import { useUiStore, type Tool } from '@/store/uiStore'

const TOOL_OPTIONS: { value: Tool; label: string; icon: React.ReactNode }[] = [
  { value: 'select', label: 'Select and move (V)', icon: <MousePointer2 /> },
  { value: 'pan', label: 'Pan (H)', icon: <Hand /> },
]

/**
 * Canvas commands. Phone: floating, thumb-reachable pill with the essentials
 * (pinch handles zoom). Tablet: floating with zoom buttons. Desktop: inline in
 * the top bar, with shortcut hints.
 */
export function CanvasToolbar({ layout }: { layout: Layout }) {
  const actions = useCanvasActions()
  const tool = useUiStore((s) => s.tool)
  const setTool = useUiStore((s) => s.setTool)
  const snap = useUiStore((s) => s.snapToGrid)
  const toggleSnap = useUiStore((s) => s.toggleSnap)
  const openPalette = useUiStore((s) => s.setPaletteOpen)
  const selectionSize = useDiagramStore((s) => s.selection.length)
  const deleteSelection = useDiagramStore((s) => s.deleteSelection)
  const floating = layout !== 'desktop'

  const content = (
    <>
      <Segmented label="Canvas tool" options={TOOL_OPTIONS} value={tool} onChange={setTool} className={cn(floating && 'rounded-full')} />
      {layout === 'phone' && (
        <Button variant="primary" size="icon" aria-label="Add shape" className="rounded-full" onClick={() => openPalette(true)}>
          <Plus />
        </Button>
      )}
      <Button variant="ghost" size="icon" aria-label="Snap to grid (G)" title="Snap to grid (G)" aria-pressed={snap} onClick={toggleSnap} className={cn(floating && 'rounded-full')}>
        <Grid3x3 />
      </Button>
      {layout !== 'phone' && (
        <>
          <Button variant="ghost" size="icon" aria-label="Zoom out (-)" title="Zoom out (-)" onClick={actions.zoomOut} className={cn(floating && 'rounded-full')}>
            <ZoomOut />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Zoom in (+)" title="Zoom in (+)" onClick={actions.zoomIn} className={cn(floating && 'rounded-full')}>
            <ZoomIn />
          </Button>
        </>
      )}
      <Button variant="ghost" size="icon" aria-label="Fit to screen (F)" title="Fit to screen (F)" onClick={actions.fitView} className={cn(floating && 'rounded-full')}>
        <Maximize />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Delete selection (Del)"
        title="Delete selection (Del)"
        disabled={selectionSize === 0}
        onClick={deleteSelection}
        className={cn('text-danger hover:bg-surface-muted', floating && 'rounded-full')}
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
