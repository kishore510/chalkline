import { isGroupLocked, isNodeLocked } from '@/store/groups'
import { useDiagramStore } from '@/store/diagramStore'
import { useUiStore } from '@/store/uiStore'

/** Deletes the selection (groups are ungrouped) and says if locked items were left alone. */
export function deleteSelectionWithNotice() {
  const { diagram, selection, deleteSelection } = useDiagramStore.getState()
  const ids = new Set(selection)
  const locked =
    diagram.nodes.filter((n) => ids.has(n.id) && isNodeLocked(diagram, n)).length +
    diagram.groups.filter((g) => ids.has(g.id) && isGroupLocked(diagram, g)).length
  deleteSelection()
  if (locked > 0) useUiStore.getState().notify(`${locked} locked ${locked === 1 ? 'item was' : 'items were'} not deleted.`)
}
