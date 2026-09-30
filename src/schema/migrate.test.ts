import { describe, expect, it } from 'vitest'
import { fixtures } from '@/fixtures'
import { MIGRATIONS, migrate, parseDiagram, SCHEMA_VERSION, type Migration } from './diagram'

describe('MIGRATIONS', () => {
  it('has a migration for every version step up to the current version', () => {
    for (let v = 1; v < SCHEMA_VERSION; v++) {
      expect(MIGRATIONS[v], `missing migration from v${v}`).toBeTypeOf('function')
    }
  })

  it.each(Object.entries(fixtures))('loads the %s fixture', (_name, fixture) => {
    expect(parseDiagram(fixture).schemaVersion).toBe(SCHEMA_VERSION)
  })
})

describe('migrate', () => {
  const fake: Record<number, Migration> = {
    1: ({ old, ...doc }) => ({ ...doc, schemaVersion: 2, renamed: old }),
    2: (doc) => ({ ...doc, schemaVersion: 3, added: true }),
  }

  it('applies each step in order without mutating the input', () => {
    const input = { schemaVersion: 1, old: 'x' }
    expect(migrate(input, 3, fake)).toEqual({ schemaVersion: 3, renamed: 'x', added: true })
    expect(input).toEqual({ schemaVersion: 1, old: 'x' })
  })

  it('starts from the document version', () => {
    expect(migrate({ schemaVersion: 2 }, 3, fake)).toEqual({ schemaVersion: 3, added: true })
  })

  it('returns current documents untouched', () => {
    const input = { schemaVersion: 3 }
    expect(migrate(input, 3, fake)).toBe(input)
  })

  it('passes non-objects through for the schema to reject', () => {
    expect(migrate(null, 3, fake)).toBeNull()
    expect(migrate('x', 3, fake)).toBe('x')
  })

  it('fails clearly when a step is missing or there is no version', () => {
    expect(() => migrate({ schemaVersion: 1 }, 3, { 1: fake[1]! })).toThrow('No migration from schema v2.')
    expect(() => migrate({ nodes: [] }, 3, fake)).toThrow('No migration from schema v0.')
  })

  it('refuses a step that does not advance the version', () => {
    expect(() => migrate({ schemaVersion: 1 }, 3, { 1: (doc) => doc })).toThrow(/did not advance/)
  })

  it('rejects documents from a newer app', () => {
    expect(() => migrate({ schemaVersion: 4 }, 3, fake)).toThrow(/newer schema \(v4\)/)
  })
})
