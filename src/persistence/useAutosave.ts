import { useErrorStore } from '@/errors/errorStore'
import { friendlyError } from '@/errors/friendly'
import { SCHEMA_VERSION } from '@/schema/diagram'
import { createNewDiagram } from '@/settings/newDiagram'
import { useDiagramStore } from '@/store/diagramStore'
import { useUiStore } from '@/store/uiStore'
import { CORRUPT_KEY, loadAutosave, saveAutosave, type AutosaveLoad } from './autosave'
import { downloadText, saveJson } from './download'
import { readKey, type WriteResult } from './localStore'

// Wait this long after the last change before writing, so a drag is one write.
const DEBOUNCE_MS = 400

/*
 * While paused, nothing is written over the stored autosave: used when it
 * holds data this version can't read (from a newer version, or damaged and
 * not copied aside), and before clearing data or restoring a backup.
 */
let paused = false
/** Pauses autosave. Returns a function that undoes this pause (if it was the one that paused it). */
export const pauseAutosave = (): (() => void) => {
  if (paused) return () => {}
  paused = true
  const status = useUiStore.getState().saveStatus
  useUiStore.getState().setSaveStatus('off')
  return () => {
    paused = false
    useUiStore.getState().setSaveStatus(status)
    // Anything changed meanwhile is written now.
    flushPending(true)
  }
}
export const isAutosavePaused = () => paused

/** Downloads data that couldn't be loaded, exactly as it was stored. */
export const exportRecovered = (text: string) => void downloadText(text, 'chalkline-recovered.json')

const exportNow = { label: 'Export JSON now', run: () => void saveJson(), primary: true }

/**
 * Loads the autosaved diagram, if any, as the starting document. Problems are
 * shown as a banner and never lose data: a damaged autosave is kept under its
 * own key; one from a newer version is left untouched and autosave pauses.
 * With nothing saved, starts a blank diagram with the text defaults from settings.
 */
export function restoreAutosave(): AutosaveLoad {
  const result = loadAutosave()
  const store = useDiagramStore.getState()
  const errors = useErrorStore.getState()
  switch (result.status) {
    case 'ok':
      store.load(result.diagram, { undoable: false })
      break
    case 'none':
      store.load(createNewDiagram(), { undoable: false })
      break
    case 'newer':
      pauseAutosave()
      errors.showBanner(friendlyError('autosave-newer', undefined, { version: result.version, supported: SCHEMA_VERSION }), [
        { label: 'Reload', run: () => window.location.reload(), primary: true },
        { label: 'Export saved data', run: () => exportRecovered(result.text) },
      ])
      break
    case 'corrupt':
      if (!result.kept) pauseAutosave()
      errors.showBanner(friendlyError(result.kept ? 'autosave-corrupt' : 'autosave-corrupt-not-kept', result.problem), [
        { label: 'Export recovered data', run: () => exportRecovered(result.text), primary: true },
      ])
      break
  }
  return result
}

/** Set while autosave runs: writes any pending change now. */
let flushPending = (_force?: boolean) => {}

/** Writes any pending change now (before a backup is made, for example). */
export const flushAutosave = () => flushPending()

/** The time of the last successful save, for "what's at risk". */
let lastSaved: Date | null = null

/** Shows (or clears) the autosave problem banner after a save attempt. */
export function reportSaveResult(result: WriteResult) {
  const errors = useErrorStore.getState()
  const ui = useUiStore.getState()
  ui.setSaveStatus(result === 'ok' ? 'saved' : 'error')
  const current = errors.banner?.error.kind
  if (result === 'ok') {
    lastSaved = new Date()
    if (current === 'autosave-full' || current === 'autosave-blocked') {
      errors.clearBanner(['autosave-full', 'autosave-blocked'])
      ui.notify('Autosave is working again.')
    }
    return
  }
  const kind = result === 'full' ? 'autosave-full' : 'autosave-blocked'
  // Already showing it: don't re-announce on every change. Retrying happens on the next change regardless.
  if (current === kind) return
  const note = lastSaved ? `Last saved in this browser at ${lastSaved.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}.` : undefined
  errors.showBanner(friendlyError(kind), [exportNow], note)
}

/**
 * Saves the diagram to browser storage shortly after every change, and
 * immediately when the page is hidden or closed. A failed save is shown and
 * retried on the next change. Returns a stop function.
 */
export function startAutosave(): () => void {
  let timer: number | undefined
  let pending = false

  const flush = (force = false) => {
    window.clearTimeout(timer)
    if (!(pending || force) || paused) return
    pending = false
    reportSaveResult(saveAutosave(useDiagramStore.getState().diagram))
  }
  flushPending = flush

  const unsubscribe = useDiagramStore.subscribe((state, previous) => {
    if (state.diagram === previous.diagram) return
    pending = true
    window.clearTimeout(timer)
    timer = window.setTimeout(() => flush(), DEBOUNCE_MS)
  })
  const onHide = () => document.visibilityState === 'hidden' && flush()
  const onPageHide = () => flush()
  window.addEventListener('pagehide', onPageHide)
  document.addEventListener('visibilitychange', onHide)
  if (!paused) useUiStore.getState().setSaveStatus('saved')

  return () => {
    flush()
    flushPending = () => {}
    unsubscribe()
    window.removeEventListener('pagehide', onPageHide)
    document.removeEventListener('visibilitychange', onHide)
  }
}

/** The raw text of a damaged autosave kept aside, if there is one. */
export const recoveredText = () => readKey(CORRUPT_KEY)
