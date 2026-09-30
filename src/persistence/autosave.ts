import { safeParseDiagram, type Diagram } from '@/schema/diagram'
import { serializeDiagram } from './serialize'

/*
 * Autosave to browser storage. Storage is per-origin and can be cleared,
 * blocked or full, so every access is guarded and JSON export stays the
 * real backup.
 */

export const AUTOSAVE_KEY = 'chalkline.autosave'
/** Where an autosave that fails to load is moved, so it is never silently lost. */
export const CORRUPT_KEY = 'chalkline.autosave.unreadable'

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

const defaultStorage = (): Store | undefined => {
  try {
    return globalThis.localStorage
  } catch {
    return undefined
  }
}

/** Returns true if the diagram was written. */
export function saveAutosave(diagram: Diagram, storage: Store | undefined = defaultStorage()): boolean {
  try {
    if (!storage) return false
    storage.setItem(AUTOSAVE_KEY, serializeDiagram(diagram))
    return true
  } catch {
    return false
  }
}

/**
 * The autosaved diagram (migrated to the current schema), or null if there
 * isn't one. An unreadable autosave is set aside under CORRUPT_KEY.
 */
export function loadAutosave(storage: Store | undefined = defaultStorage()): Diagram | null {
  try {
    const text = storage?.getItem(AUTOSAVE_KEY)
    if (!text) return null
    let raw: unknown
    try {
      raw = JSON.parse(text)
    } catch {
      raw = undefined
    }
    const result = safeParseDiagram(raw)
    if (result.success) return result.data
    storage?.setItem(CORRUPT_KEY, text)
    storage?.removeItem(AUTOSAVE_KEY)
    return null
  } catch {
    return null
  }
}
