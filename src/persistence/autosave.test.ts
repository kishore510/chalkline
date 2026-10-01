import { describe, expect, it } from 'vitest'
import { fixtures, invalidFixtures } from '@/fixtures'
import { parseDiagram, SCHEMA_VERSION } from '@/schema/diagram'
import { AUTOSAVE_KEY, CORRUPT_KEY, issueSummary, loadAutosave, saveAutosave } from './autosave'
import { memoryStorage } from './testStorage'

const quota = () => Object.assign(new Error('full'), { name: 'QuotaExceededError' })

describe('autosave', () => {
  it('saves and loads a diagram', () => {
    const storage = memoryStorage()
    const diagram = parseDiagram(fixtures['web-architecture'])
    expect(saveAutosave(diagram, storage)).toBe('ok')
    expect(loadAutosave(storage)).toEqual({ status: 'ok', diagram })
  })

  it('finds nothing when nothing is saved or storage is unavailable', () => {
    expect(loadAutosave(memoryStorage())).toEqual({ status: 'none' })
    expect(loadAutosave(undefined)).toEqual({ status: 'none' })
  })

  it('says why a save failed: storage full or blocked', () => {
    const empty = parseDiagram(fixtures.empty)
    expect(saveAutosave(empty, { ...memoryStorage(), setItem: () => { throw quota() } })).toBe('full')
    expect(saveAutosave(empty, { ...memoryStorage(), setItem: () => { throw new Error('SecurityError') } })).toBe('blocked')
    expect(saveAutosave(empty, undefined)).toBe('blocked')
    const blocked = { ...memoryStorage(), getItem: () => { throw new Error('SecurityError') } }
    expect(loadAutosave(blocked)).toEqual({ status: 'none' })
  })

  it.each([
    ['broken JSON', '{"schemaVersion": 1, '],
    ['an invalid diagram', JSON.stringify(invalidFixtures['invalid-dangling-edge'])],
  ])('keeps a copy of %s under the recovery key instead of losing it', (_label, text) => {
    const storage = memoryStorage()
    storage.setItem(AUTOSAVE_KEY, text)
    const result = loadAutosave(storage)
    expect(result).toMatchObject({ status: 'corrupt', kept: true, text })
    expect(result.status === 'corrupt' && result.problem.length).toBeGreaterThan(0)
    expect(storage.data.get(CORRUPT_KEY)).toBe(text)
    expect(storage.data.has(AUTOSAVE_KEY)).toBe(false)
  })

  it('leaves a damaged autosave where it is if the copy can’t be made', () => {
    const storage = memoryStorage({ [AUTOSAVE_KEY]: '{oops' })
    storage.setItem = () => {
      throw quota()
    }
    expect(loadAutosave(storage)).toMatchObject({ status: 'corrupt', kept: false })
    expect(storage.data.get(AUTOSAVE_KEY)).toBe('{oops')
    expect(storage.data.has(CORRUPT_KEY)).toBe(false)
  })

  it('refuses an autosave from a newer schema and leaves storage exactly as it was', () => {
    const text = JSON.stringify({ ...parseDiagram(fixtures['web-architecture']), schemaVersion: SCHEMA_VERSION + 1 })
    const storage = memoryStorage({ [AUTOSAVE_KEY]: text })
    const before = new Map(storage.data)
    expect(loadAutosave(storage)).toEqual({ status: 'newer', version: SCHEMA_VERSION + 1, text })
    expect(storage.data).toEqual(before)
  })

  it('summarises validation problems briefly', () => {
    const issues = Array.from({ length: 5 }, (_, i) => ({ path: ['nodes', i, 'id'], message: 'Bad' }))
    expect(issueSummary({ issues })).toBe('nodes.0.id: Bad\nnodes.1.id: Bad\nnodes.2.id: Bad\n…and 2 more')
    expect(issueSummary(new Error('plain'))).toBe('plain')
  })
})
