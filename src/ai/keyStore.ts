import { create } from 'zustand'
import { appStorage, readKey, removeKey, writeKey, type KeyValueStore, type WriteResult } from '@/persistence/localStore'
import { STORAGE_KEYS } from '@/persistence/storageKeys'
import type { AiKeyStorage } from '@/settings/schema'
import { updateSettings } from '@/settings/settingsStore'
import { registerSecret } from './redact'

/*
 * Where the Anthropic API key lives. Two places, never both:
 *
 * - "This session only" (the default): in memory, in this module, and
 *   nowhere else. Not sessionStorage: GitHub Pages shares one origin between
 *   every project on the account, and memory is gone on reload or close.
 * - "Remember on this device" (opt-in): localStorage, under its own registry
 *   entry (secret, never backed up). Read into memory on load.
 *
 * Switching moves the key and clears the other place. The key itself is
 * never in a React or Zustand state (only whether there is one, where, and
 * its last four characters), so it can't leak through a state dump or the DOM.
 */

export type KeyPlace = AiKeyStorage

export const AI_KEY = STORAGE_KEYS.aiKey.key

/** The key in use, or null. Module-private on purpose. */
let secret: string | null = null

export interface KeyStatus {
  /** Where the key is, or null for no key. */
  place: KeyPlace | null
  /** Last four characters, for the masked display. Empty without a key. */
  tail: string
}

const NO_KEY: KeyStatus = { place: null, tail: '' }

const statusFor = (key: string | null, place: KeyPlace): KeyStatus => (key ? { place, tail: key.slice(-4) } : NO_KEY)

/** A remembered key from a previous visit, read into memory. */
export function loadRememberedKey(storage: Pick<Storage, 'getItem'> | undefined = appStorage()): KeyStatus {
  const stored = readKey(AI_KEY, storage)?.trim() || null
  secret = stored
  if (stored) registerSecret(stored)
  return statusFor(stored, 'device')
}

export const useKeyStatus = create<KeyStatus>()(() => loadRememberedKey())

/** The key for a request, or null. Only the request layer should call this. */
export const getApiKey = () => secret

/** "•••• abcd" */
export const maskedKey = (tail: string) => `•••• ${tail}`

/** Keys are pasted with stray spaces and line breaks; nothing else is changed. */
export const cleanKey = (raw: string) => raw.replace(/\s+/g, '')

/** A soft check, for a hint only: Anthropic API keys start like this. */
export const looksLikeAnthropicKey = (key: string) => /^sk-ant-(?:[\w-]){20,}$/.test(key)

export interface SaveResult {
  /** Where the key ended up (session if remembering it failed). */
  place: KeyPlace
  /** Set when "Remember on this device" was asked for but storage refused. */
  rememberFailed?: Exclude<WriteResult, 'ok'>
}

/**
 * Saves a key in `place`. If the browser won't store it, it is kept for this
 * session instead, and the result says why. The other place is always cleared.
 */
export function saveKey(raw: string, place: KeyPlace, storage: KeyValueStore | undefined = appStorage()): SaveResult {
  const key = cleanKey(raw)
  if (!key) throw new Error('No key to save')
  secret = key
  registerSecret(key)
  let result: SaveResult = { place }
  if (place === 'device') {
    const written = writeKey(AI_KEY, key, storage)
    if (written !== 'ok') {
      removeKey(AI_KEY, storage)
      result = { place: 'session', rememberFailed: written }
    }
  } else {
    removeKey(AI_KEY, storage)
  }
  useKeyStatus.setState(statusFor(key, result.place))
  return result
}

/**
 * Moves the key (if there is one) to `place`, clears the other place, and
 * remembers the choice for the next key.
 */
export function setKeyPlace(place: KeyPlace, storage: KeyValueStore | undefined = appStorage()): SaveResult {
  updateSettings({ ai: { keyStorage: place } })
  if (!secret) {
    removeKey(AI_KEY, storage)
    return { place }
  }
  return saveKey(secret, place, storage)
}

/** Removes the key from memory and from this browser. */
export function forgetKey(storage: KeyValueStore | undefined = appStorage()) {
  secret = null
  removeKey(AI_KEY, storage)
  useKeyStatus.setState(NO_KEY)
}
