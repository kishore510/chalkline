import { Link2 } from 'lucide-react'
import { LearnMore } from '@/help/HelpEntry'
import { LEARN_MORE } from '@/help/links'
import { useDiagramStore } from '@/store/diagramStore'
import { useUiStore } from '@/store/uiStore'

/** Link mode instructions, updated after the first tap. Placed by the editor's top stack. */
export function LinkHint() {
  const active = useUiStore((s) => s.tool === 'link')
  const sourceId = useUiStore((s) => s.linkSourceId)
  const sourceLabel = useDiagramStore((s) => s.diagram.nodes.find((n) => n.id === sourceId)?.label)
  if (!active) return null
  return (
    <div className="flex max-w-full justify-center" aria-live="polite">
      <div className="flex max-w-full items-center gap-2 rounded-full border border-accent bg-surface pr-1 pl-4 text-sm font-medium text-text shadow-md">
        <Link2 className="size-4 shrink-0 text-accent" aria-hidden="true" />
        <span className="truncate">{sourceId ? `From “${sourceLabel || 'shape'}”: now tap the target` : 'Tap source, then target'}</span>
        {/* The chip ignores pointers so taps reach the canvas; only this link takes them. */}
        <LearnMore topic={LEARN_MORE.linkMode} className="pointer-events-auto rounded-full" />
      </div>
    </div>
  )
}
