import { describe, expect, it } from 'vitest'
import { fixtures } from '@/fixtures'
import { SCHEMA_VERSION } from './diagram'
import { DiagramLoadError, loadDiagram, MIGRATIONS, runMigrations, type Migration } from './migrate'

describe('MIGRATIONS', () => {
  it('has one migration for every version step up to the current version', () => {
    for (let v = 1; v < SCHEMA_VERSION; v++) {
      expect(MIGRATIONS[v], `missing migration ${v} -> ${v + 1}`).toBeTypeOf('function')
    }
    expect(Object.keys(MIGRATIONS).map(Number).every((v) => v >= 1 && v < SCHEMA_VERSION)).toBe(true)
  })
})

describe('runMigrations', () => {
  const fake: Record<number, Migration> = {
    1: (doc) => ({ ...doc, renamed: doc.old, old: undefined }),
    2: (doc) => ({ ...doc, added: true }),
  }

  it('applies each step in order and stamps the new version', () => {
    const input = { schemaVersion: 1, old: 'x' }
    const out = runMigrations(input, 3, fake)
    expect(out).toEqual({ schemaVersion: 3, renamed: 'x', old: undefined, added: true })
    expect(input).toEqual({ schemaVersion: 1, old: 'x' })
  })

  it('starts from the document version, not version 1', () => {
    expect(runMigrations({ schemaVersion: 2 }, 3, fake)).toEqual({ schemaVersion: 3, added: true })
  })

  it('leaves current documents untouched', () => {
    const input = { schemaVersion: 3, a: 1 }
    expect(runMigrations(input, 3, fake)).toBe(input)
  })

  it('fails clearly when a step is missing', () => {
    expect(() => runMigrations({ schemaVersion: 1 }, 3, { 1: fake[1]! })).toThrow('No migration from schema 2 to 3')
  })

  it.each([
    ['null', null],
    ['an array', []],
    ['a string', 'diagram'],
    ['no version', { nodes: [] }],
    ['version 0', { schemaVersion: 0 }],
    ['a string version', { schemaVersion: '1' }],
  ])('rejects %s', (_label, input) => {
    expect(() => runMigrations(input, 3, fake)).toThrow(DiagramLoadError)
  })

  it('rejects documents from a newer app', () => {
    expect(() => runMigrations({ schemaVersion: 4 }, 3, fake)).toThrow(/newer version/)
  })
})

describe('loadDiagram', () => {
  it.each(Object.entries(fixtures))('loads the %s fixture', (_name, fixture) => {
    expect(loadDiagram(fixture).schemaVersion).toBe(SCHEMA_VERSION)
  })

  it('reports readable issues for an invalid document', () => {
    const bad = { ...(fixtures.empty as object), edges: [{ id: 'e', source: 'a', target: 'b', markerStart: 'none', markerEnd: 'arrow' }] }
    try {
      loadDiagram(bad)
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(DiagramLoadError)
      expect((error as DiagramLoadError).issues).toEqual([
        'edges.0.source: Edge source "a" does not match any node',
        'edges.0.target: Edge target "b" does not match any node',
      ])
    }
  })
})
