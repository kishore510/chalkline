import { Link2 } from 'lucide-react'
import { useDiagramStore } from '@/store/diagramStore'
import { useUiStore } from '@/store/uiStore'

/** Link mode instructions, updated after the first tap. */
export function LinkHint() {
  const active = useUiStore((s) => s.tool === 'link')
  const sourceId = useUiStore((s) => s.linkSourceId)
  const sourceLabel = useDiagramStore((s) => s.diagram.nodes.find((n) => n.id === sourceId)?.label)
  if (!active) return null
  return (
    <div className="pointer-events-none absolute inset-x-0 top-10 z-10 flex justify-center px-4" aria-live="polite">
      <div className="flex max-w-full items-center gap-2 rounded-full border border-accent bg-surface px-4 py-2 text-sm font-medium text-text shadow-md">
        <Link2 className="size-4 shrink-0 text-accent" aria-hidden="true" />
        <span className="truncate">{sourceId ? `From “${sourceLabel || 'shape'}”: now tap the target` : 'Tap source, then target'}</span>
      </div>
    </div>
  )
}
