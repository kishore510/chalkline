import { describe, expect, it } from 'vitest'
import { stencilFixtures } from '@/fixtures'
import { SCHEMA_VERSION } from '@/schema/diagram'
import { MAX_LIBRARY_STENCILS, parseStencil, parseStencilFile, type StencilContent } from './format'
import { cleanDetails, createLibrary, describeImport, FULL_MESSAGE, LibraryError, QUOTA_MESSAGE, splitTags, uniqueName, UNAVAILABLE_MESSAGE } from './library'
import { memoryRepository, type StencilRepository } from './repository'
import { stencilThumbnail } from './thumbnail'
import { testThumbnailEnv } from './testEnv'

const content = parseStencil(stencilFixtures.current).content
const thumbnail = (c: StencilContent) => stencilThumbnail(c, testThumbnailEnv)

function setup(repository: StencilRepository = memoryRepository()) {
  let n = 0
  const lib = createLibrary({ repository, thumbnail, now: () => new Date('2026-10-01T12:00:00.000Z'), makeId: () => `s_${++n}` })
  return { lib, repository }
}

const quotaRepo = (): StencilRepository => ({
  list: async () => [],
  put: async () => {
    throw new DOMException('full', 'QuotaExceededError')
  },
  remove: async () => undefined,
})

describe('details', () => {
  it('trims, requires a name and category, and dedupes tags', () => {
    expect(cleanDetails({ name: '  A ', category: ' Web ', tags: ['x', ' X', '', 'y'] })).toEqual({ name: 'A', category: 'Web', tags: ['x', 'y'] })
    expect(() => cleanDetails({ name: ' ', category: 'a', tags: [] })).toThrow(LibraryError)
    expect(() => cleanDetails({ name: 'a', category: '', tags: [] })).toThrow(/category/)
    expect(splitTags(' a, b ,,c')).toEqual(['a', 'b', 'c'])
    expect(uniqueName('Web', ['web', 'Web (2)'])).toBe('Web (3)')
  })
})

describe('library', () => {
  it('saves a stencil with a cached thumbnail and loads it back', async () => {
    const { lib, repository } = setup()
    const r = await lib.save({ name: 'Pair', category: 'Web', tags: ['a'] }, content)
    expect(r.stencil).toMatchObject({ kind: 'chalkline-stencil', schemaVersion: SCHEMA_VERSION, id: 's_1', name: 'Pair', created: '2026-10-01T12:00:00.000Z' })
    expect(r.thumbnail).toMatch(/^<svg/)
    const again = createLibrary({ repository, thumbnail: () => 'regenerated' })
    const loaded = await again.load()
    expect(loaded).toHaveLength(1)
    expect(loaded[0]!.thumbnail).toBe(r.thumbnail)
    expect(again.categories()).toEqual(['Web'])
  })

  it('migrates old records on load and skips damaged ones', async () => {
    const repository = memoryRepository([
      { id: 'old', stencil: stencilFixtures.v1 as never, thumbnail: 'stale', updated: '2026-01-01T00:00:00.000Z' },
      { id: 'bad', stencil: { kind: 'chalkline-stencil' } as never, thumbnail: '', updated: '' },
    ])
    const { lib } = setup(repository)
    const loaded = await lib.load()
    expect(loaded.map((r) => r.stencil.name)).toEqual(['Old backend'])
    expect(loaded[0]!.stencil.schemaVersion).toBe(SCHEMA_VERSION)
    expect(loaded[0]!.thumbnail).not.toBe('stale')
  })

  it('renames, re-categorises and re-tags', async () => {
    const { lib } = setup()
    const r = await lib.save({ name: 'Pair', category: 'Web', tags: [] }, content)
    const u = await lib.update(r.id, { name: 'Renamed', category: 'Data', tags: ['t'] })
    expect(u.stencil).toMatchObject({ id: r.id, name: 'Renamed', category: 'Data', tags: ['t'], content: r.stencil.content })
    await expect(lib.update('missing', { name: 'a', category: 'b', tags: [] })).rejects.toThrow(LibraryError)
  })

  it('deletes and restores (Undo)', async () => {
    const { lib, repository } = setup()
    const r = await lib.save({ name: 'Pair', category: 'Web', tags: [] }, content)
    const removed = await lib.remove(r.id)
    expect(lib.all()).toEqual([])
    expect(await repository.list()).toEqual([])
    await lib.restore(removed!)
    expect(lib.all().map((x) => x.id)).toEqual([r.id])
  })

  it('duplicates, including built-ins into the library, with a unique name', async () => {
    const { lib } = setup()
    const r = await lib.save({ name: 'Pair', category: 'Web', tags: [] }, content)
    const copy = await lib.duplicate(r.stencil)
    expect(copy.stencil.name).toBe('Pair copy')
    expect(copy.id).not.toBe(r.id)
    const builtin = parseStencil(stencilFixtures.current)
    const fromBuiltin = await lib.duplicate(builtin)
    expect(fromBuiltin.stencil.name).toBe('Web pair')
    expect(fromBuiltin.id).not.toBe(builtin.id)
  })

  it('refuses to grow past the limit', async () => {
    const { lib } = setup()
    for (let i = 0; i < MAX_LIBRARY_STENCILS; i++) await lib.save({ name: `S${i}`, category: 'c', tags: [] }, content)
    await expect(lib.save({ name: 'one more', category: 'c', tags: [] }, content)).rejects.toThrow(FULL_MESSAGE)
    const result = await lib.applyImport(lib.planImport(parseStencilFile(JSON.stringify(stencilFixtures.library))), 'keep-both')
    expect(result.added).toBe(0)
    expect(result.skipped).toHaveLength(3)
  })

  it('turns quota and unavailable-storage errors into friendly messages and changes nothing', async () => {
    const { lib } = setup(quotaRepo())
    await expect(lib.save({ name: 'Pair', category: 'Web', tags: [] }, content)).rejects.toThrow(QUOTA_MESSAGE)
    expect(lib.all()).toEqual([])
    const broken = setup({ ...quotaRepo(), list: async () => Promise.reject(new DOMException('x', 'NotSupportedError')) }).lib
    await expect(broken.load()).rejects.toThrow(UNAVAILABLE_MESSAGE)
  })
})

describe('import and export', () => {
  const bundle = () => parseStencilFile(JSON.stringify(stencilFixtures.library))

  it('imports a library bundle and reports counts', async () => {
    const { lib } = setup()
    const plan = lib.planImport(bundle())
    expect(plan.clashes).toEqual([])
    const result = await lib.applyImport(plan, 'keep-both')
    expect(result).toEqual({ added: 3, replaced: 0, skipped: [] })
    expect(describeImport(result)).toBe('Imported 3 stencils.')
    expect(lib.all().map((r) => r.stencil.name)).toEqual(['Note', 'Old backend', 'Web pair'])
  })

  it('round-trips the whole library and a single stencil through export', async () => {
    const { lib } = setup()
    await lib.applyImport(lib.planImport(bundle()), 'keep-both')
    const all = lib.exportAll()
    expect(all.fileName).toBe('chalkline-stencils.json')
    expect(parseStencilFile(all.text).stencils).toEqual(lib.all().map((r) => r.stencil))
    const one = lib.exportOne(lib.all()[0]!.stencil)
    expect(one.fileName).toBe('note.stencil.json')
    expect(parseStencilFile(one.text).stencils).toEqual([lib.all()[0]!.stencil])
  })

  it('name clashes: keep both adds numbered copies; replace overwrites in place', async () => {
    const { lib } = setup()
    await lib.applyImport(lib.planImport(bundle()), 'keep-both')
    const original = lib.all().find((r) => r.stencil.name === 'Web pair')!
    await lib.update(original.id, { name: 'Web pair', category: 'Changed', tags: [] })

    const plan = lib.planImport(bundle())
    expect(plan.fresh).toEqual([])
    expect(plan.clashes.map((c) => c.existing.stencil.name).sort()).toEqual(['Note', 'Old backend', 'Web pair'])

    const kept = await lib.applyImport(plan, 'keep-both')
    expect(kept).toEqual({ added: 3, replaced: 0, skipped: [] })
    expect(lib.all().map((r) => r.stencil.name)).toContain('Web pair (2)')
    expect(new Set(lib.all().map((r) => r.id)).size).toBe(6)

    const replaced = await lib.applyImport(lib.planImport(parseStencilFile(JSON.stringify(stencilFixtures.current))), 'replace')
    expect(replaced).toEqual({ added: 0, replaced: 1, skipped: [] })
    expect(lib.get(original.id)!.stencil.category).toBe('Architecture')
    expect(lib.all()).toHaveLength(6)
  })

  it('reports skipped stencils with reasons', () => {
    expect(describeImport({ added: 1, replaced: 0, skipped: [{ name: 'Broken', reason: 'Its shapes are damaged.' }] })).toBe('Imported 1 stencil. Skipped 1: “Broken” its shapes are damaged.')
    expect(describeImport({ added: 0, replaced: 0, skipped: [] })).toBe('Nothing was imported.')
  })

  it('a quota error during import leaves the library unchanged', async () => {
    const { lib } = setup(quotaRepo())
    await expect(lib.applyImport(lib.planImport(bundle()), 'keep-both')).rejects.toThrow(QUOTA_MESSAGE)
    expect(lib.all()).toEqual([])
  })
})
