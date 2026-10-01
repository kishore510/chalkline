import { appStorage, readKey, writeKey } from '@/persistence/localStore'
import { STORAGE_KEYS } from '@/persistence/storageKeys'

/*
 * "What's new" dot: the version whose notes were last opened is remembered
 * in this browser. Storage may be missing or blocked; then nothing is
 * remembered and the dot simply shows again next time.
 */

export const LAST_SEEN_KEY = STORAGE_KEYS.lastSeenVersion.key

type Store = Pick<Storage, 'getItem' | 'setItem'>

export const readLastSeen = (store: Store | undefined = appStorage()): string | null => readKey(LAST_SEEN_KEY, store)

/** If storage refuses, the dot just shows again next visit. */
export const markSeen = (version: string, store: Store | undefined = appStorage()): void => void writeKey(LAST_SEEN_KEY, version, store)

/** True when this version's notes haven't been opened in this browser yet. */
export function hasUnseenChanges(lastSeen: string | null, current: string): boolean {
  return lastSeen !== current
}
