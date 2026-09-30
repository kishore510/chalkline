/*
 * "What's new" dot: the version whose notes were last opened is remembered
 * in this browser. Storage may be missing or blocked; then nothing is
 * remembered and the dot simply shows again next time.
 */

export const LAST_SEEN_KEY = 'chalkline.lastSeenVersion'

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>

const storage = (): Storage | undefined => {
  try {
    return globalThis.localStorage
  } catch {
    return undefined
  }
}

export function readLastSeen(store: Storage | undefined = storage()): string | null {
  try {
    return store?.getItem(LAST_SEEN_KEY) ?? null
  } catch {
    return null
  }
}

export function markSeen(version: string, store: Storage | undefined = storage()): void {
  try {
    store?.setItem(LAST_SEEN_KEY, version)
  } catch {
    // Fine: the dot shows again next visit.
  }
}

/** True when this version's notes haven't been opened in this browser yet. */
export function hasUnseenChanges(lastSeen: string | null, current: string): boolean {
  return lastSeen !== current
}
