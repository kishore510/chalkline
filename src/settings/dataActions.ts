import { friendlyError, type FriendlyError } from '@/errors/friendly'
import { applyRestore, backupFileName, buildBackup, clearOwnedData, deleteDatabase, planRestore, serializeBackup, type RestoreCheck, type RestorePlan } from '@/persistence/backup'
import { downloadText } from '@/persistence/download'
import { appStorage } from '@/persistence/localStore'
import { flushAutosave, pauseAutosave } from '@/persistence/useAutosave'
import { useStencilStore } from '@/stencils/stencilStore'
import { useDiagramStore } from '@/store/diagramStore'
import { APP_VERSION } from '@/version'

/*
 * The Data section of Settings: one-file backup, restore and clearing. The
 * rules (allowlist, validation, rollback, the key registry) live in
 * persistence/backup.ts; this wires them to the browser and the stores.
 */

/** The stencil library, loaded if it hasn't been yet (empty if IndexedDB is unavailable). */
async function stencils() {
  const store = useStencilStore.getState()
  await store.ensureLoaded()
  return useStencilStore.getState().items.map((r) => r.stencil)
}

/** Downloads diagram, stencil library and settings as one JSON backup. */
export async function exportEverything() {
  // Make sure the latest edit is in storage before reading it back.
  flushAutosave()
  const now = new Date()
  const backup = buildBackup(appStorage(), await stencils(), { created: now.toISOString(), appVersion: APP_VERSION })
  await downloadText(serializeBackup(backup), backupFileName(now))
}

/** Reads and checks a backup file. Nothing is changed. */
export async function checkBackupFile(file: File): Promise<RestoreCheck> {
  let text: string
  try {
    text = await file.text()
  } catch (error) {
    return { ok: false, error: friendlyError('file-unreadable', (error as Error).message) }
  }
  const current = { title: useDiagramStore.getState().diagram.meta.title, stencils: (await stencils()).length }
  return planRestore(text, current)
}

/**
 * Restores a checked backup, then reloads so everything starts from it.
 * Autosave pauses first so the diagram on screen can't be written over the
 * restored one. On failure everything is put back, autosave resumes, and the
 * problem is returned to show.
 */
export async function restoreBackup(plan: RestorePlan, reload = () => window.location.reload()): Promise<FriendlyError | null> {
  const resume = pauseAutosave()
  const problem = await applyRestore(plan, appStorage(), (s) => useStencilStore.getState().replaceAll(s))
  if (!problem) {
    reload()
    return null
  }
  resume()
  return problem
}

/**
 * Removes every key and database Chalkline owns (by the registry), then
 * reloads to a clean, first-run state. If something couldn't be removed,
 * returns the problem instead (autosave stays paused: some data is already gone).
 */
export async function clearLocalData(reload = () => window.location.reload()): Promise<FriendlyError | null> {
  pauseAutosave()
  const result = await clearOwnedData(appStorage(), deleteDatabase)
  if (result.failed.length === 0) {
    reload()
    return null
  }
  return friendlyError('clear-failed', `Not removed: ${result.failed.join(', ')}`)
}
