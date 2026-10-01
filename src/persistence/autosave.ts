import { safeParseDiagram, SCHEMA_VERSION, type Diagram } from '@/schema/diagram'
import { appStorage, readKey, writeKey, type KeyValueStore, type WriteResult } from './localStore'
import { serializeDiagram } from './serialize'
import { STORAGE_KEYS } from './storageKeys'

/*
 * Autosave to browser storage. Storage is per-origin and can be cleared,
 * blocked or full, so every access is guarded and JSON export stays the
 * real backup.
 */

export const AUTOSAVE_KEY = STORAGE_KEYS.autosave.key
/** Where an autosave that fails to load is copied, so it is never silently lost. */
export const CORRUPT_KEY = STORAGE_KEYS.recovered.key

/** 'ok', or why the diagram couldn't be written ('full' or 'blocked'). */
export function saveAutosave(diagram: Diagram, storage: KeyValueStore | undefined = appStorage()): WriteResult {
  return writeKey(AUTOSAVE_KEY, serializeDiagram(diagram), storage)
}

export type AutosaveLoad =
  | { status: 'none' }
  | { status: 'ok'; diagram: Diagram }
  /**
   * Saved by a newer version. Left exactly as it is: the caller must not
   * write over it (autosave pauses) so updating the app gets it back.
   */
  | { status: 'newer'; version: number; text: string }
  /**
   * Unreadable. Copied to CORRUPT_KEY, then removed from AUTOSAVE_KEY; if the
   * copy couldn't be made (`kept: false`), the original stays where it was and
   * the caller must not write over it either.
   */
  | { status: 'corrupt'; kept: boolean; text: string; problem: string }

const versionOf = (raw: unknown) => {
  const v = (raw as { schemaVersion?: unknown } | null)?.schemaVersion
  return typeof v === 'number' ? v : null
}

/** Reads the autosave (migrated to the current schema) and says what it found. */
export function loadAutosave(storage: KeyValueStore | undefined = appStorage()): AutosaveLoad {
  const text = readKey(AUTOSAVE_KEY, storage)
  if (!text) return { status: 'none' }
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (error) {
    return setAside(text, `Not valid JSON: ${(error as Error).message}`, storage)
  }
  const version = versionOf(raw)
  if (version !== null && version > SCHEMA_VERSION) return { status: 'newer', version, text }
  const result = safeParseDiagram(raw)
  if (result.success) return { status: 'ok', diagram: result.data }
  return setAside(text, issueSummary(result.error), storage)
}

function setAside(text: string, problem: string, storage: KeyValueStore | undefined): AutosaveLoad {
  const kept = writeKey(CORRUPT_KEY, text, storage) === 'ok' && readKey(CORRUPT_KEY, storage) === text
  if (kept) {
    try {
      storage?.removeItem(AUTOSAVE_KEY)
    } catch {
      // Still readable from CORRUPT_KEY; the next save replaces it anyway.
    }
  }
  return { status: 'corrupt', kept, text, problem }
}

/** A short technical description of why a document failed validation (for a "Details" toggle). */
export function issueSummary(error: unknown, max = 3): string {
  const issues = (error as { issues?: { path: PropertyKey[]; message: string }[] } | null)?.issues
  if (!Array.isArray(issues) || issues.length === 0) return error instanceof Error ? error.message : String(error)
  const lines = issues.slice(0, max).map((i) => `${i.path.length ? i.path.map(String).join('.') : '(document)'}: ${i.message}`)
  if (issues.length > max) lines.push(`…and ${issues.length - max} more`)
  return lines.join('\n')
}
