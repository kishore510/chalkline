import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { fixtures } from '@/fixtures'
import { parseDiagram, SCHEMA_VERSION } from '@/schema/diagram'
import { memoryStorage } from './testStorage'

/*
 * Autosave as the app runs it: what people see when saving fails or the
 * saved diagram can't be loaded. Runs against an in-memory localStorage.
 */

const storage = memoryStorage()
const original = globalThis.localStorage
globalThis.localStorage = storage as unknown as Storage
afterAll(() => {
  globalThis.localStorage = original
})

const { useErrorStore } = await import('@/errors/errorStore')
const { useDiagramStore } = await import('@/store/diagramStore')
const { useUiStore } = await import('@/store/uiStore')
const { AUTOSAVE_KEY, CORRUPT_KEY } = await import('./autosave')
const { isAutosavePaused, pauseAutosave, reportSaveResult, restoreAutosave } = await import('./useAutosave')

beforeEach(() => {
  storage.data.clear()
  useErrorStore.setState({ banner: null, dialog: null })
})

describe('autosave failures are visible', () => {
  it('storage full: a banner says what is at risk and offers Export JSON now', () => {
    reportSaveResult('full')
    const banner = useErrorStore.getState().banner
    expect(banner?.error.kind).toBe('autosave-full')
    expect(banner?.error.message).toMatch(/aren’t saved/)
    expect(banner?.actions.map((a) => a.label)).toEqual(['Export JSON now'])
    expect(useUiStore.getState().saveStatus).toBe('error')
  })

  it('storage blocked (private mode) gets its own message', () => {
    reportSaveResult('blocked')
    expect(useErrorStore.getState().banner?.error.kind).toBe('autosave-blocked')
  })

  it('shows the banner once, not again on every failed retry', () => {
    reportSaveResult('full')
    const first = useErrorStore.getState().banner
    reportSaveResult('full')
    expect(useErrorStore.getState().banner).toBe(first)
  })

  it('clears the banner when a later save works', () => {
    reportSaveResult('full')
    reportSaveResult('ok')
    expect(useErrorStore.getState().banner).toBeNull()
    expect(useUiStore.getState().saveStatus).toBe('saved')
  })
})

describe('loading the autosave on startup', () => {
  it('a damaged autosave: kept under the recovery key, empty diagram, banner offers the data', () => {
    storage.setItem(AUTOSAVE_KEY, '{"schemaVersion": 5, "nod')
    expect(restoreAutosave().status).toBe('corrupt')
    expect(storage.data.get(CORRUPT_KEY)).toBe('{"schemaVersion": 5, "nod')
    expect(useDiagramStore.getState().diagram.nodes).toEqual([])
    const banner = useErrorStore.getState().banner
    expect(banner?.error.kind).toBe('autosave-corrupt')
    expect(banner?.actions.map((a) => a.label)).toEqual(['Export recovered data'])
  })

  it('a newer autosave: refused, stored data unchanged, autosave paused so it is never overwritten', () => {
    const text = JSON.stringify({ ...parseDiagram(fixtures['web-architecture']), schemaVersion: SCHEMA_VERSION + 1 })
    storage.setItem(AUTOSAVE_KEY, text)
    const before = new Map(storage.data)
    expect(restoreAutosave().status).toBe('newer')
    expect(storage.data).toEqual(before)
    expect(isAutosavePaused()).toBe(true)
    expect(useErrorStore.getState().banner?.error.kind).toBe('autosave-newer')
  })
})

describe('pausing autosave', () => {
  it('an inner pause does not resume one that was already in place', () => {
    // Paused by the previous test (newer autosave); a restore attempt pauses and resumes around it.
    expect(isAutosavePaused()).toBe(true)
    pauseAutosave()()
    expect(isAutosavePaused()).toBe(true)
  })
})
