import { useDiagramStore } from '@/store/diagramStore'
import { getLayer, nearestUsableLayer } from '@/store/layers'
import { useUiStore } from '@/store/uiStore'

/** Switches to the nearest visible, unlocked layer, or opens the Layers panel if there isn't one. */
export function switchToUsableLayer() {
  const store = useDiagramStore.getState()
  const target = nearestUsableLayer(store.diagram, store.activeLayerId)
  if (target) {
    store.setActiveLayer(target)
    useUiStore.getState().notify(`Now adding to “${getLayer(store.diagram, target)?.name || 'Untitled layer'}”.`)
  } else {
    useUiStore.getState().setLayersOpen(true)
    useUiStore.getState().notify('Every layer is hidden or locked. Show or unlock one to add things.')
  }
}

/**
 * If adding was refused because the active layer is hidden or locked, says so
 * with a "Switch layer" action. Returns true if it explained.
 */
export function explainBlockedAdd(): boolean {
  const store = useDiagramStore.getState()
  const problem = store.activeLayerProblem()
  if (!problem) return false
  const name = getLayer(store.diagram, store.activeLayerId)?.name || 'Untitled layer'
  useUiStore.getState().notify(`Can’t add to “${name}”: the layer is ${problem}.`, { label: 'Switch layer', run: switchToUsableLayer })
  return true
}

/** After a visibility or lock change: say where new items go now, if that changed. */
export function reportLayerSwitch(result: { switchedTo?: string | null }) {
  if (result.switchedTo === undefined) return
  const store = useDiagramStore.getState()
  if (result.switchedTo === null) {
    useUiStore.getState().notify('Every layer is hidden or locked, so nothing can be added until one is shown and unlocked.')
    return
  }
  useUiStore.getState().notify(`New items now go on “${getLayer(store.diagram, result.switchedTo)?.name || 'Untitled layer'}”.`)
}
