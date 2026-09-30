import { Undo2 } from 'lucide-react'
import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Panel } from '@/components/ui/panel'
import { readToken } from '@/lib/cssVar'
import { useDiagramStore } from '@/store/diagramStore'

/** "Deleted. Undo" after any delete; restores the removed shapes and their connectors. */
export function UndoToast() {
  const deletionId = useDiagramStore((s) => s.lastDeletion?.id)
  const restore = useDiagramStore((s) => s.undoDeletion)

  useEffect(() => {
    if (deletionId === undefined) return
    const timer = window.setTimeout(() => useDiagramStore.getState().dismissDeletion(), readToken('--cl-toast-duration', 5000))
    return () => window.clearTimeout(timer)
  }, [deletionId])

  return (
    <div aria-live="polite" className="flex justify-center">
      {deletionId !== undefined && (
        <Panel role="status" className="pointer-events-auto flex items-center gap-1 rounded-full py-0 pr-1 pl-4 shadow-lg">
          <span className="text-sm">Deleted.</span>
          <Button variant="ghost" onClick={restore} className="rounded-full px-3 text-accent">
            <Undo2 />
            Undo
          </Button>
        </Panel>
      )}
    </div>
  )
}
