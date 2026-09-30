import { describe, expect, it } from 'vitest'
import { fixtures, invalidFixtures } from '@/fixtures'
import { parseDiagram } from '@/schema/diagram'
import { AUTOSAVE_KEY, CORRUPT_KEY, loadAutosave, saveAutosave } from './autosave'

function memoryStorage() {
  const map = new Map<string, string>()
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  }
}

describe('autosave', () => {
  it('saves and loads a diagram', () => {
    const storage = memoryStorage()
    const diagram = parseDiagram(fixtures['web-architecture'])
    expect(saveAutosave(diagram, storage)).toBe(true)
    expect(loadAutosave(storage)).toEqual(diagram)
  })

  it('returns null when nothing is saved or storage is unavailable', () => {
    expect(loadAutosave(memoryStorage())).toBeNull()
    expect(loadAutosave(undefined)).toBeNull()
    expect(saveAutosave(parseDiagram(fixtures.empty), undefined)).toBe(false)
  })

  it('reports failure when storage throws (full or blocked)', () => {
    const full = { ...memoryStorage(), setItem: () => { throw new Error('QuotaExceededError') } }
    expect(saveAutosave(parseDiagram(fixtures.empty), full)).toBe(false)
    const blocked = { ...memoryStorage(), getItem: () => { throw new Error('SecurityError') } }
    expect(loadAutosave(blocked)).toBeNull()
  })

  it.each([
    ['broken JSON', '{"schemaVersion": 1, '],
    ['an invalid diagram', JSON.stringify(invalidFixtures['invalid-dangling-edge'])],
    ['a newer schema', JSON.stringify({ schemaVersion: 99 })],
  ])('sets aside %s instead of losing it', (_label, text) => {
    const storage = memoryStorage()
    storage.setItem(AUTOSAVE_KEY, text)
    expect(loadAutosave(storage)).toBeNull()
    expect(storage.map.get(CORRUPT_KEY)).toBe(text)
    expect(storage.map.has(AUTOSAVE_KEY)).toBe(false)
  })
})
