import { useDiagramStore } from '@/store/diagramStore'
import { useUiStore } from '@/store/uiStore'
import { loadAutosave, saveAutosave } from './autosave'

// Wait this long after the last change before writing, so a drag is one write.
const DEBOUNCE_MS = 400

/** Loads the autosaved diagram, if any, as the starting document. Returns true if one was restored. */
export function restoreAutosave(): boolean {
  const saved = loadAutosave()
  if (!saved) return false
  useDiagramStore.getState().load(saved, { undoable: false })
  return true
}

/**
 * Saves the diagram to browser storage shortly after every change, and
 * immediately when the page is hidden or closed. Returns a stop function.
 */
export function startAutosave(): () => void {
  let timer: number | undefined
  let pending = false

  const flush = () => {
    window.clearTimeout(timer)
    if (!pending) return
    pending = false
    const ok = saveAutosave(useDiagramStore.getState().diagram)
    useUiStore.getState().setSaveStatus(ok ? 'saved' : 'error')
  }

  const unsubscribe = useDiagramStore.subscribe((state, previous) => {
    if (state.diagram === previous.diagram) return
    pending = true
    window.clearTimeout(timer)
    timer = window.setTimeout(flush, DEBOUNCE_MS)
  })
  const onHide = () => document.visibilityState === 'hidden' && flush()
  window.addEventListener('pagehide', flush)
  document.addEventListener('visibilitychange', onHide)
  useUiStore.getState().setSaveStatus('saved')

  return () => {
    flush()
    unsubscribe()
    window.removeEventListener('pagehide', flush)
    document.removeEventListener('visibilitychange', onHide)
  }
}
