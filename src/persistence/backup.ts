import { cleanRecents } from '@/editor/paletteModel'
import { friendlyError, type FriendlyError } from '@/errors/friendly'
import { safeParseDiagram, SCHEMA_VERSION } from '@/schema/diagram'
import { parseSettings } from '@/settings/schema'
import { parseStencil, type Stencil } from '@/stencils/format'
import { cleanRecentStencils } from '@/stencils/search'
import { issueSummary } from './autosave'
import { readKey, writeKey, type KeyValueStore } from './localStore'
import { serializeDiagram } from './serialize'
import { BACKUP_KEYS, OWNED_DATABASES, OWNED_KEYS, STORAGE_KEYS, type StorageKeyName } from './storageKeys'

/*
 * "Export everything" and "Import backup": the diagram, stencil library and
 * settings in one JSON file. Only the allowlisted keys (storageKeys.ts,
 * `backup: true`) are read on export or written on import; anything else in a
 * backup file is ignored. Pure apart from the injected storage, so it's tested
 * without a browser.
 */

export const BACKUP_KIND = 'chalkline-backup'
export const BACKUP_VERSION = 1

export interface BackupFile {
  kind: typeof BACKUP_KIND
  backupVersion: number
  created: string
  appVersion: string
  /** Allowlisted storage keys and their values (parsed JSON where possible). */
  storage: Record<string, unknown>
  stencils: unknown[]
}

/* ---------- Export ---------- */

const parsed = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

/** The backup, built key by key from the allowlist. */
export function buildBackup(storage: Pick<Storage, 'getItem'> | undefined, stencils: readonly Stencil[], meta: { created: string; appVersion: string }): BackupFile {
  const entries: Record<string, unknown> = {}
  for (const key of BACKUP_KEYS) {
    const text = readKey(key, storage)
    if (text !== null) entries[key] = parsed(text)
  }
  return { kind: BACKUP_KIND, backupVersion: BACKUP_VERSION, created: meta.created, appVersion: meta.appVersion, storage: entries, stencils: [...stencils] }
}

export const serializeBackup = (backup: BackupFile) => JSON.stringify(backup, null, 2) + '\n'

export const backupFileName = (date: Date) => `chalkline-backup-${date.toISOString().slice(0, 10)}.json`

/* ---------- Import ---------- */

type BackupKeyName = { [K in StorageKeyName]: (typeof STORAGE_KEYS)[K]['backup'] extends true ? K : never }[StorageKeyName]

type Restored = { ok: true; text: string; title?: string } | { ok: false; newer?: number; problem: string }

/** How each backed-up key is checked and written back. Every allowlisted key must have one (the type enforces it). */
const RESTORERS: Record<BackupKeyName, (value: unknown) => Restored> = {
  settings: (value) => ({ ok: true, text: JSON.stringify(parseSettings(value)) }),
  autosave(value) {
    const version = (value as { schemaVersion?: unknown } | null)?.schemaVersion
    if (typeof version === 'number' && version > SCHEMA_VERSION) return { ok: false, newer: version, problem: `Diagram format version ${version}; supported up to ${SCHEMA_VERSION}.` }
    const result = safeParseDiagram(value)
    if (!result.success) return { ok: false, problem: `The diagram in the backup is damaged:\n${issueSummary(result.error)}` }
    return { ok: true, text: serializeDiagram(result.data), title: result.data.meta.title }
  },
  recentShapes: (value) => ({ ok: true, text: JSON.stringify(cleanRecents(value)) }),
  recentStencils: (value) => ({ ok: true, text: JSON.stringify(cleanRecentStencils(value)) }),
}

const NAME_BY_KEY = new Map<string, StorageKeyName>(Object.entries(STORAGE_KEYS).map(([name, k]) => [k.key, name as StorageKeyName]))

export interface RestorePlan {
  created: string
  /** Storage keys to write, already validated and in their stored form. */
  writes: { key: string; text: string }[]
  stencils: Stencil[]
  /** Stencils in the backup that couldn't be read (left out). */
  skippedStencils: number
  /** What will be replaced, in words, for the confirmation. */
  replaces: string[]
  /** Entries in the file that aren't on the allowlist (never written). */
  ignored: string[]
}

export type RestoreCheck = { ok: true; plan: RestorePlan } | { ok: false; error: FriendlyError }

const invalid = (detail: string): RestoreCheck => ({ ok: false, error: friendlyError('backup-invalid', detail) })
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/**
 * Checks a backup file completely before anything is changed, and says what
 * restoring it would replace. Refuses a backup (or a diagram inside it) from
 * a newer version.
 */
export function planRestore(text: string, current: { title: string; stencils: number }): RestoreCheck {
  if (text.trim() === '') return invalid('The file is empty.')
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (error) {
    return invalid(`Not valid JSON: ${(error as Error).message}`)
  }
  const file = raw as Partial<BackupFile> | null
  if (typeof file !== 'object' || file === null || file.kind !== BACKUP_KIND) {
    const diagram = typeof file === 'object' && file !== null && 'schemaVersion' in file && 'nodes' in file
    return invalid(diagram ? 'This is a single diagram, not a backup. Open it with Open JSON in the menu.' : 'No "kind": "chalkline-backup" in the file.')
  }
  if (typeof file.backupVersion !== 'number' || file.backupVersion > BACKUP_VERSION) {
    return { ok: false, error: friendlyError('backup-newer', `Backup format version ${String(file.backupVersion)}; supported up to ${BACKUP_VERSION}.`) }
  }
  const storage = typeof file.storage === 'object' && file.storage !== null && !Array.isArray(file.storage) ? file.storage : {}
  if (!Array.isArray(file.stencils)) return invalid('The stencil list is missing.')

  const writes: RestorePlan['writes'] = []
  const ignored: string[] = []
  const replaces: string[] = []
  for (const [key, value] of Object.entries(storage)) {
    const name = NAME_BY_KEY.get(key)
    if (!name || !BACKUP_KEYS.includes(key)) {
      ignored.push(key)
      continue
    }
    const restored = RESTORERS[name as BackupKeyName](value)
    if (!restored.ok) {
      return restored.newer !== undefined
        ? { ok: false, error: friendlyError('backup-newer', restored.problem) }
        : invalid(restored.problem)
    }
    writes.push({ key, text: restored.text })
    if (name === 'autosave') replaces.push(`Your current diagram “${current.title}” is replaced by “${restored.title ?? 'Untitled diagram'}”.`)
    if (name === 'settings') replaces.push('Your settings are replaced.')
  }

  const stencils: Stencil[] = []
  let skippedStencils = 0
  for (const item of file.stencils) {
    try {
      stencils.push(parseStencil(item))
    } catch {
      skippedStencils++
    }
  }
  replaces.push(`Your stencil library (${plural(current.stencils, 'stencil')}) is replaced by ${plural(stencils.length, 'stencil')} from the backup.`)

  return { ok: true, plan: { created: typeof file.created === 'string' ? file.created : '', writes, stencils, skippedStencils, replaces, ignored } }
}

/**
 * Restores a checked plan: storage first (rolled back if any write fails),
 * then the stencil library (storage rolled back if that fails). Returns null on
 * success, or the problem to show.
 */
export async function applyRestore(plan: RestorePlan, storage: KeyValueStore | undefined, replaceStencils: (stencils: Stencil[]) => Promise<void>): Promise<FriendlyError | null> {
  const previous = plan.writes.map(({ key }) => ({ key, text: readKey(key, storage) }))
  const rollback = () => {
    for (const { key, text } of previous) {
      if (text === null) storage?.removeItem(key)
      else writeKey(key, text, storage)
    }
  }
  for (const { key, text } of plan.writes) {
    const result = writeKey(key, text, storage)
    if (result !== 'ok') {
      rollback()
      return friendlyError('restore-failed', `Writing ${key}: storage ${result}.`)
    }
  }
  try {
    await replaceStencils(plan.stencils)
  } catch (error) {
    rollback()
    return friendlyError('restore-failed', `Stencil library: ${(error as Error).message}`)
  }
  return null
}

/* ---------- Clear ---------- */

export interface ClearResult {
  /** Keys that were present and removed. */
  removed: string[]
  /** Keys or databases that couldn't be removed. */
  failed: string[]
}

/**
 * Removes every key and database the app owns, by the registry: nothing else
 * in this origin's storage is touched.
 */
export async function clearOwnedData(storage: KeyValueStore | undefined, deleteDatabase: (name: string) => Promise<void>): Promise<ClearResult> {
  const result: ClearResult = { removed: [], failed: [] }
  for (const key of OWNED_KEYS) {
    try {
      if (storage?.getItem(key) === null) continue
      storage?.removeItem(key)
      result.removed.push(key)
    } catch {
      result.failed.push(key)
    }
  }
  for (const name of OWNED_DATABASES) {
    try {
      await deleteDatabase(name)
    } catch {
      result.failed.push(`IndexedDB ${name}`)
    }
  }
  return result
}

/** Deletes an IndexedDB database. Resolves once deleted (or if IndexedDB isn't there). */
export function deleteDatabase(name: string, factory: IDBFactory | undefined = globalThis.indexedDB): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!factory) return resolve()
    const req = factory.deleteDatabase(name)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error ?? new Error('Couldn’t delete the database'))
    // Another tab still has it open: it finishes when that tab closes.
    req.onblocked = () => reject(new Error('Open in another tab'))
  })
}
