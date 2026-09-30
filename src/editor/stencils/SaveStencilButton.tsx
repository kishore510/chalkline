import { BookmarkPlus } from 'lucide-react'
import { Button, type ButtonProps } from '@/components/ui/button'
import { selectionSaveable } from '@/stencils/fragment'
import { useDiagramStore } from '@/store/diagramStore'
import { saveSelectionAsStencil } from './actions'

/** True while "Save as stencil" applies to the selection. */
export const useSelectionSaveable = () => useDiagramStore((s) => selectionSaveable(s.diagram, s.selection))

/** "Save as stencil" for the current selection; hidden when it doesn't apply. */
export function SaveStencilButton({ iconOnly = false, className, variant = 'secondary' }: { iconOnly?: boolean; className?: string; variant?: ButtonProps['variant'] }) {
  const saveable = useSelectionSaveable()
  if (!saveable) return null
  return (
    <Button
      variant={iconOnly ? 'ghost' : variant}
      size={iconOnly ? 'icon' : 'default'}
      aria-label="Save as stencil"
      title="Save the selection to My library as a stencil"
      className={className}
      onClick={saveSelectionAsStencil}
    >
      <BookmarkPlus />
      {!iconOnly && 'Save as stencil'}
    </Button>
  )
}
