import { useCallback } from 'react'
import { useCanvasActions } from '@/canvas/useCanvasActions'
import { readToken } from '@/lib/cssVar'
import { motionMs } from '@/lib/motion'
import { useDiagramStore } from '@/store/diagramStore'
import { useUiStore } from '@/store/uiStore'

/** An Undo action for a toast, valid only while nothing else has been done since. */
function undoAction(historySize: number) {
  return {
    label: 'Undo',
    run: () => {
      const store = useDiagramStore.getState()
      if (store.past.length === historySize) store.undo()
      else useUiStore.getState().notify('Something else changed since; use the Undo button instead.')
    },
  }
}

/** Auto-arrange and Tidy connectors, as used by the Tidy menu. */
export function useTidy() {
  const actions = useCanvasActions()

  const arrange = useCallback(async () => {
    const ui = useUiStore.getState()
    if (ui.busy) return
    const { direction, spacing } = ui.arrangePrefs
    const { diagram, selection } = useDiagramStore.getState()
    ui.setBusy('Arranging…')
    try {
      // Both load on demand: layout code and ELK stay out of the initial bundle.
      const [{ computeLayout }, { getElk }] = await Promise.all([import('@/layout/computeLayout'), import('@/layout/elkWorker')])
      const grid = ui.snapToGrid ? readToken('--cl-grid-gap', 20) : 0
      const result = await computeLayout(diagram, { direction, spacing, scope: selection, grid }, await getElk())
      if (!result.ok) return ui.notify(result.message)
      if (useDiagramStore.getState().diagram !== diagram) {
        return ui.notify('The diagram changed while arranging, so nothing was applied. Try again.')
      }
      const duration = motionMs('--cl-duration-slow')
      if (duration > 0) ui.setAnimating(true)
      const changed = useDiagramStore.getState().applyLayout(result)
      window.setTimeout(() => {
        useUiStore.getState().setAnimating(false)
        actions.fitView()
      }, duration)
      if (changed) ui.notify(result.message, undoAction(useDiagramStore.getState().past.length))
      else ui.notify('Already arranged.')
    } catch {
      ui.notify('Auto-arrange isn’t available right now. Nothing was changed.')
    } finally {
      useUiStore.getState().setBusy(null)
    }
  }, [actions])

  const tidyConnectors = useCallback(() => {
    const ui = useUiStore.getState()
    const { cleared } = useDiagramStore.getState().tidyConnectors({ clearPinned: ui.arrangePrefs.clearPinned })
    if (cleared > 0) {
      ui.notify(`Set ${cleared} pinned ${cleared === 1 ? 'connector' : 'connectors'} back to auto.`, undoAction(useDiagramStore.getState().past.length))
    } else {
      ui.notify(
        ui.arrangePrefs.clearPinned
          ? 'No pinned connectors to clear. Auto connectors already take the nearest clear sides.'
          : 'Connectors are tidy: auto connectors take the nearest clear sides and share sides evenly. Pinned ends were left alone.',
      )
    }
  }, [])

  return { arrange, tidyConnectors }
}
