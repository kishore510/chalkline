/*
 * The one way into localStorage. Storage can be missing, blocked (private
 * mode, site-data settings) or full, so access is guarded and callers get
 * `undefined` rather than an exception. Keys come from storageKeys.ts.
 */

export type KeyValueStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/** localStorage, or undefined where the browser blocks it. */
export function appStorage(): KeyValueStore | undefined {
  try {
    return globalThis.localStorage ?? undefined
  } catch {
    return undefined
  }
}

/** Reads a key; null if missing or unreadable. */
export function readKey(key: string, storage: Pick<Storage, 'getItem'> | undefined = appStorage()): string | null {
  try {
    return storage?.getItem(key) ?? null
  } catch {
    return null
  }
}

export type WriteResult = 'ok' | 'full' | 'blocked'

/** Writes a key, saying why it failed if it did. */
export function writeKey(key: string, value: string, storage: Pick<Storage, 'setItem'> | undefined = appStorage()): WriteResult {
  if (!storage) return 'blocked'
  try {
    storage.setItem(key, value)
    return 'ok'
  } catch (error) {
    return isQuotaError(error) ? 'full' : 'blocked'
  }
}

export function removeKey(key: string, storage: Pick<Storage, 'removeItem'> | undefined = appStorage()): boolean {
  try {
    storage?.removeItem(key)
    return true
  } catch {
    return false
  }
}

/** True for the browser's "storage is full" errors (named differently across browsers). */
export const isQuotaError = (error: unknown) =>
  typeof error === 'object' &&
  error !== null &&
  ((error as { name?: string }).name === 'QuotaExceededError' ||
    (error as { name?: string }).name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    (error as { code?: number }).code === 22 ||
    (error as { code?: number }).code === 1014)
