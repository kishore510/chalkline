import { describe, expect, it } from 'vitest'
import { fixtures, invalidFixtures, legacyFixtures, stencilFixtures } from '@/fixtures'
import { friendlyError, MAX_DETAIL, spokenError, type CoreErrorKind, type ErrorKind } from '@/errors/friendly'
import { parseDiagram, SCHEMA_VERSION } from '@/schema/diagram'
import { readDiagramFile } from './openFile'
import { serializeDiagram } from './serialize'

const json = (name = 'diagram.json') => ({ name, type: 'application/json' })
const kindOf = (file: { name: string; type?: string }, text: string) => {
  const result = readDiagramFile(file, text)
  return result.ok ? 'ok' : result.error.kind
}

describe('opening a diagram file', () => {
  it('opens a saved diagram', () => {
    const diagram = parseDiagram(fixtures['web-architecture'])
    const result = readDiagramFile(json(), serializeDiagram(diagram))
    expect(result).toEqual({ ok: true, diagram })
  })

  it('opens diagrams saved at every older schema version (migrated)', () => {
    for (const [name, raw] of Object.entries(legacyFixtures)) {
      const result = readDiagramFile(json(), JSON.stringify(raw))
      expect(result.ok, name).toBe(true)
      if (result.ok) expect(result.diagram.schemaVersion).toBe(SCHEMA_VERSION)
    }
  })

  it.each<[string, { name: string; type?: string }, string, ErrorKind]>([
    ['an empty file', json(), '', 'file-empty'],
    ['a blank file', json(), '  \n', 'file-empty'],
    ['a picture', { name: 'photo.png', type: 'image/png' }, '\u0089PNG\r\n…', 'file-type'],
    ['a .drawio file', { name: 'chart.drawio', type: '' }, '<mxfile></mxfile>', 'file-type'],
    ['a truncated .json', json(), '{"schemaVersion": 5, "nodes": [', 'file-not-json'],
    ['JSON that is a single value', json(), '42', 'file-not-diagram'],
    ['JSON that is something else', json(), '{"name": "package"}', 'file-not-diagram'],
    ['a stencil', json(), JSON.stringify(stencilFixtures.current), 'file-is-stencil'],
    ['a backup', json(), JSON.stringify({ kind: 'chalkline-backup', backupVersion: 1 }), 'file-is-backup'],
    ['an invalid diagram', json(), JSON.stringify(invalidFixtures['invalid-dangling-edge']), 'file-invalid'],
    ['a newer diagram', json(), JSON.stringify({ ...parseDiagram(fixtures.empty), schemaVersion: SCHEMA_VERSION + 1 }), 'file-newer'],
  ])('explains %s', (_label, file, text, kind) => {
    expect(kindOf(file, text)).toBe(kind)
  })

  it('gives invalid files a short technical detail', () => {
    const result = readDiagramFile(json(), JSON.stringify(invalidFixtures['invalid-dangling-edge']))
    expect(!result.ok && result.error.detail).toMatch(/edges\.\d+\.(source|target): .*does not exist/)
  })

  it('says which versions are involved for a newer file', () => {
    const result = readDiagramFile(json(), JSON.stringify({ schemaVersion: SCHEMA_VERSION + 3, nodes: [] }))
    expect(!result.ok && result.error.message).toContain(`version ${SCHEMA_VERSION + 3}`)
    expect(!result.ok && result.error.message).toContain(`up to version ${SCHEMA_VERSION}`)
  })
})

describe('friendly messages', () => {
  it('every file error says the current diagram is unchanged and gives a next step', () => {
    const kinds: CoreErrorKind[] = ['file-empty', 'file-type', 'file-not-json', 'file-not-diagram', 'file-is-backup', 'file-is-stencil', 'file-invalid', 'file-newer', 'file-unreadable']
    for (const kind of kinds) {
      const e = friendlyError(kind)
      expect(e.message, kind).toMatch(/current diagram hasn’t changed/)
      expect(e.next.length, kind).toBeGreaterThan(0)
    }
  })

  it('autosave failures say what’s at risk and what to do', () => {
    expect(friendlyError('autosave-full').message).toMatch(/lost if you close this tab/)
    expect(friendlyError('autosave-full').next).toMatch(/Export JSON now/)
    expect(friendlyError('autosave-blocked').message).toMatch(/lost when you close this tab/)
  })

  it('caps the technical detail and speaks the whole message', () => {
    expect(friendlyError('file-invalid', 'x'.repeat(MAX_DETAIL * 2)).detail).toHaveLength(MAX_DETAIL + 1)
    expect(friendlyError('file-invalid', '   ').detail).toBeUndefined()
    const e = friendlyError('file-empty')
    expect(spokenError(e)).toBe(`${e.title}. ${e.message} ${e.next}`)
  })
})
