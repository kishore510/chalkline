import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fixtures, stencilFixtures } from '@/fixtures'
import { buildBackup, clearOwnedData, serializeBackup } from '@/persistence/backup'
import { serializeDiagram, toCanonical } from '@/persistence/serialize'
import { STORAGE_KEYS } from '@/persistence/storageKeys'
import { memoryStorage } from '@/persistence/testStorage'
import { parseDiagram } from '@/schema/diagram'
import { getSettings, updateSettings } from '@/settings/settingsStore'
import { parseStencil, serializeLibrary, serializeStencil } from '@/stencils/format'
import { AI_KEY, cleanKey, forgetKey, getApiKey, loadRememberedKey, looksLikeAnthropicKey, maskedKey, saveKey, setKeyPlace, useKeyStatus } from './keyStore'
import { buildPayload } from './payload'
import { containsSecret, resetSecretsForTests } from './redact'

/*
 * The key-handling rules, checked with a fake key: where it lives in each
 * mode, that switching moves it, that clearing removes it, and that it never
 * appears in anything the app writes out.
 */

const FAKE = 'sk-ant-api03-FAKE_test_key_0123456789abcdefghij-XYZ1'

let storage = memoryStorage()

beforeEach(() => {
  storage = memoryStorage()
  forgetKey(storage)
  updateSettings({ ai: { keyStorage: 'session' } })
})

afterEach(() => resetSecretsForTests())

describe('storage modes', () => {
  it('"This session only" keeps the key in memory and writes nothing to the browser', () => {
    expect(saveKey(FAKE, 'session', storage)).toEqual({ place: 'session' })
    expect(getApiKey()).toBe(FAKE)
    expect(storage.data.size).toBe(0)
    expect(useKeyStatus.getState()).toEqual({ place: 'session', tail: 'XYZ1' })
  })

  it('"Remember on this device" writes it under its own registered key only', () => {
    saveKey(FAKE, 'device', storage)
    expect([...storage.data.keys()]).toEqual([AI_KEY])
    expect(storage.data.get(AI_KEY)).toBe(FAKE)
    expect(useKeyStatus.getState().place).toBe('device')
  })

  it('a remembered key is read back on the next visit', () => {
    saveKey(FAKE, 'device', storage)
    forgetKeyInMemoryOnly()
    expect(loadRememberedKey(storage)).toEqual({ place: 'device', tail: 'XYZ1' })
    expect(getApiKey()).toBe(FAKE)
  })

  it('switching session → device moves the key; device → session clears the browser copy', () => {
    saveKey(FAKE, 'session', storage)
    setKeyPlace('device', storage)
    expect(storage.data.get(AI_KEY)).toBe(FAKE)
    expect(getSettings().ai.keyStorage).toBe('device')

    setKeyPlace('session', storage)
    expect(storage.data.has(AI_KEY)).toBe(false)
    expect(getApiKey()).toBe(FAKE)
    expect(useKeyStatus.getState().place).toBe('session')
    expect(getSettings().ai.keyStorage).toBe('session')
  })

  it('saving in session mode removes a key left in the browser', () => {
    storage.setItem(AI_KEY, 'sk-ant-api03-an-older-remembered-key-000000')
    saveKey(FAKE, 'session', storage)
    expect(storage.data.has(AI_KEY)).toBe(false)
  })

  it('if the browser refuses to remember it, the key is kept for this session and the reason given', () => {
    const full = memoryStorage()
    full.setItem = () => {
      throw Object.assign(new Error('full'), { name: 'QuotaExceededError' })
    }
    expect(saveKey(FAKE, 'device', full)).toEqual({ place: 'session', rememberFailed: 'full' })
    expect(getApiKey()).toBe(FAKE)
    expect(useKeyStatus.getState().place).toBe('session')
  })

  it('Remove key clears memory and the browser', () => {
    saveKey(FAKE, 'device', storage)
    forgetKey(storage)
    expect(getApiKey()).toBeNull()
    expect(storage.data.size).toBe(0)
    expect(useKeyStatus.getState()).toEqual({ place: null, tail: '' })
  })

  it('cleans pasted whitespace, masks to the last four, and hints at the key shape', () => {
    expect(cleanKey(`  ${FAKE}\n`)).toBe(FAKE)
    expect(maskedKey('XYZ1')).toBe('•••• XYZ1')
    expect(looksLikeAnthropicKey(FAKE)).toBe(true)
    expect(looksLikeAnthropicKey('hello')).toBe(false)
    expect(() => saveKey('   ', 'session', storage)).toThrow()
  })
})

describe('Clear local data', () => {
  it('removes a remembered key (by the registry) and the session key', async () => {
    saveKey(FAKE, 'device', storage)
    const result = await clearOwnedData(storage, async () => {})
    forgetKey(storage) // what clearLocalData does before reloading
    expect(result.removed).toContain(AI_KEY)
    expect(storage.data.has(AI_KEY)).toBe(false)
    expect(getApiKey()).toBeNull()
  })

  it('removes a session-only key too', () => {
    saveKey(FAKE, 'session', storage)
    forgetKey(storage)
    expect(getApiKey()).toBeNull()
  })
})

describe('the key never leaves in an export', () => {
  const diagram = parseDiagram(fixtures['web-architecture'])
  const stencil = parseStencil(stencilFixtures.current)

  beforeEach(() => {
    saveKey(FAKE, 'device', storage)
    // Everything else a real browser would hold.
    storage.setItem(STORAGE_KEYS.settings.key, JSON.stringify(getSettings()))
    storage.setItem(STORAGE_KEYS.autosave.key, serializeDiagram(diagram))
    storage.setItem(STORAGE_KEYS.recentShapes.key, '["rectangle"]')
  })

  const outputs = (): Record<string, string> => ({
    'backup (Export everything)': serializeBackup(buildBackup(storage, [stencil], { created: '2026-10-01T00:00:00Z', appVersion: '0.21.0' })),
    'diagram JSON (Save as JSON)': serializeDiagram(diagram),
    // The canonical form is what a share link (5e) will encode: its test must be added here.
    'canonical diagram (share payload source)': JSON.stringify(toCanonical(diagram)),
    'stencil export': serializeStencil(stencil),
    'stencil library export': serializeLibrary([stencil]),
    'settings': JSON.stringify(getSettings()),
    'AI payload': buildPayload(diagram, { includeNotes: true, includePositions: true }).json,
  })

  it.each(Object.keys(outputs()))('%s holds no key', (name) => {
    const text = outputs()[name]!
    expect(text).not.toContain(FAKE)
    expect(text).not.toContain('FAKE_test_key')
    expect(containsSecret(text)).toBe(false)
  })

  it('the only storage entry holding the key is its own (so autosave recovery copies can’t hold it)', () => {
    const holders = [...storage.data.entries()].filter(([, value]) => value.includes(FAKE)).map(([key]) => key)
    expect(holders).toEqual([AI_KEY])
  })
})

/** A reload: memory is gone, browser storage stays. */
function forgetKeyInMemoryOnly() {
  const kept = new Map(storage.data)
  forgetKey(storage)
  for (const [k, v] of kept) storage.data.set(k, v)
}
