import { describe, expect, it } from 'vitest'
import { stencilFixtures } from '@/fixtures'
import { SCHEMA_VERSION } from '@/schema/diagram'
import {
  LIBRARY_KIND,
  MAX_FILE_BYTES,
  MAX_LIBRARY_STENCILS,
  MAX_STENCIL_NODES,
  parseStencil,
  parseStencilFile,
  serializeLibrary,
  serializeStencil,
  StencilFileError,
  StencilSchema,
} from './format'

const clone = <T>(v: T): T => structuredClone(v)
const current = () => clone(stencilFixtures.current) as Record<string, unknown> & { content: { nodes: Record<string, unknown>[]; edges: Record<string, unknown>[]; groups: Record<string, unknown>[] } }
const errorOf = (fn: () => unknown) => {
  try {
    fn()
  } catch (error) {
    return error as Error
  }
  throw new Error('expected a throw')
}

describe('stencil envelope', () => {
  it('accepts the current-version fixture unchanged in content', () => {
    const s = parseStencil(stencilFixtures.current)
    expect(s.name).toBe('Web pair')
    expect(s.content.nodes.map((n) => n.id)).toEqual(['n_app', 'n_cache'])
    expect(s.content.edges[0]).toMatchObject({ sourceHandle: 'right', targetHandle: 'left', label: 'reads', style: { dashed: true } })
    expect(s.content.nodes[0]!.notes).toBe('Stateless')
    expect(StencilSchema.safeParse(s).success).toBe(true)
  })

  it('rejects a wrong kind, missing name or category, and broken content with friendly messages', () => {
    expect(errorOf(() => parseStencil({ ...current(), kind: 'nope' })).message).toBe('It isn’t a Chalkline stencil.')
    expect(errorOf(() => parseStencil({ ...current(), name: '  ' })).message).toMatch(/name/)
    expect(errorOf(() => parseStencil({ ...current(), category: undefined })).message).toMatch(/category/)
    const dangling = current()
    dangling.content.edges[0]!.target = 'ghost'
    expect(errorOf(() => parseStencil(dangling))).toBeInstanceOf(StencilFileError)
    const newer = { ...current(), schemaVersion: SCHEMA_VERSION + 1 }
    expect(errorOf(() => parseStencil(newer)).message).toMatch(/newer version/)
  })

  it('ignores meta and layers in content and strips layer ids and locks', () => {
    const s = current()
    Object.assign(s.content, { meta: { title: 'x' }, layers: [{ id: 'l2' }] })
    s.content.nodes[0]!.layerId = 'l2'
    s.content.nodes[0]!.locked = true
    s.content.groups[0]!.locked = true
    s.content.edges[0]!.layerId = 'l2'
    const parsed = parseStencil(s)
    expect(parsed.content).not.toHaveProperty('meta')
    expect(parsed.content).not.toHaveProperty('layers')
    expect(parsed.content.nodes[0]).not.toHaveProperty('layerId')
    expect(parsed.content.edges[0]).not.toHaveProperty('layerId')
    expect(parsed.content.nodes[0]!.locked).toBe(false)
    expect(parsed.content.groups[0]!.locked).toBe(false)
  })

  it('refuses a lane without its pool', () => {
    const s = current()
    s.content.groups[0]!.kind = 'lane'
    expect(() => parseStencil(s)).toThrow(StencilFileError)
  })

  it('enforces the node limit', () => {
    const s = current()
    const node = s.content.nodes[1]!
    s.content.nodes = Array.from({ length: MAX_STENCIL_NODES + 1 }, (_, i) => ({ ...node, id: `n${i}`, groupId: undefined }))
    s.content.edges = []
    expect(errorOf(() => parseStencil(s)).message).toBe(`It has more than ${MAX_STENCIL_NODES} shapes.`)
    s.content.nodes = s.content.nodes.slice(0, MAX_STENCIL_NODES)
    expect(parseStencil(s).content.nodes).toHaveLength(MAX_STENCIL_NODES)
  })
})

describe('stencil migration', () => {
  it('loads a stencil saved at schema v1 by wrapping it in a diagram and migrating', () => {
    const s = parseStencil(stencilFixtures.v1)
    expect(s.schemaVersion).toBe(SCHEMA_VERSION)
    expect(s.content.groups[0]).toMatchObject({ id: 'g_backend', kind: 'container', locked: false })
    expect(s.content.nodes.every((n) => n.locked === false && n.layerId === undefined)).toBe(true)
    expect(s.content.edges[0]).toMatchObject({ source: 'api', target: 'db', sourceHandle: 'bottom', targetHandle: 'top' })
    expect(s.created).toBe('2026-01-15T00:00:00.000Z')
  })

  it('keeps unknown shape ids unchanged through a save and load', () => {
    const s = parseStencil(stencilFixtures.unknownShape)
    expect(s.content.nodes[0]!.type).toBe('hologram')
    const again = parseStencil(JSON.parse(serializeStencil(s)))
    expect(again).toEqual(s)
  })
})

describe('stencil files', () => {
  it('reads a single stencil and a library bundle of three', () => {
    expect(parseStencilFile(JSON.stringify(stencilFixtures.current))).toMatchObject({ kind: 'stencil', skipped: [] })
    const lib = parseStencilFile(JSON.stringify(stencilFixtures.library))
    expect(lib.kind).toBe('library')
    expect(lib.stencils.map((s) => s.name)).toEqual(['Web pair', 'Old backend', 'Note'])
    expect(lib.skipped).toEqual([])
  })

  it('round-trips through serializeStencil and serializeLibrary', () => {
    const lib = parseStencilFile(JSON.stringify(stencilFixtures.library))
    expect(parseStencilFile(serializeLibrary(lib.stencils)).stencils).toEqual(lib.stencils)
    const one = lib.stencils[0]!
    expect(parseStencilFile(serializeStencil(one)).stencils).toEqual([one])
  })

  it('skips bad stencils inside a library, with names and reasons', () => {
    const bad = { ...current(), name: 'Broken', content: { nodes: [{ id: 1 }], edges: [] } }
    const file = parseStencilFile(JSON.stringify({ kind: LIBRARY_KIND, stencils: [stencilFixtures.current, bad, 'junk'] }))
    expect(file.stencils).toHaveLength(1)
    expect(file.skipped).toEqual([
      { name: 'Broken', reason: 'Its shapes or connectors are damaged.' },
      { name: undefined, reason: 'It isn’t a Chalkline stencil.' },
    ])
  })

  it('rejects whole files clearly', () => {
    expect(errorOf(() => parseStencilFile('not json')).message).toBe('That file isn’t valid JSON.')
    expect(errorOf(() => parseStencilFile('{"hello":1}')).message).toMatch(/isn’t a Chalkline stencil/)
    expect(errorOf(() => parseStencilFile(JSON.stringify({ schemaVersion: 4, meta: {}, nodes: [] }))).message).toMatch(/diagram, not a stencil/)
    expect(errorOf(() => parseStencilFile(JSON.stringify({ ...current(), kind: 'chalkline-stencil', content: 3 }))).message).toMatch(/can’t be imported/)
    expect(errorOf(() => parseStencilFile(' '.repeat(MAX_FILE_BYTES + 1))).message).toMatch(/larger than 2 MB/)
    const tooMany = { kind: LIBRARY_KIND, stencils: Array.from({ length: MAX_LIBRARY_STENCILS + 1 }, () => stencilFixtures.current) }
    expect(errorOf(() => parseStencilFile(JSON.stringify(tooMany))).message).toMatch(/the most is 200/)
  })
})
