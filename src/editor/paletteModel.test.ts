import { describe, expect, it } from 'vitest'
import { SHAPES } from '@/shapes/registry'
import { byCategory, cleanRecents, MAX_RECENTS, pushRecent, searchShapes } from './paletteModel'

describe('searchShapes', () => {
  it('returns every shape for an empty query', () => {
    expect(searchShapes('')).toHaveLength(SHAPES.length)
    expect(searchShapes('   ')).toHaveLength(SHAPES.length)
  })

  it('matches names, ids and categories, ignoring case', () => {
    expect(searchShapes('DECISION').map((s) => s.id)).toEqual(['diamond'])
    expect(searchShapes('diamond').map((s) => s.id)).toEqual(['diamond'])
    expect(searchShapes('annotation').map((s) => s.id).sort()).toEqual(['callout', 'sticky-note', 'text'])
  })

  it('needs every word to match', () => {
    expect(searchShapes('user group').map((s) => s.id)).toEqual(['user-group'])
    expect(searchShapes('sticky queue')).toEqual([])
  })
})

describe('byCategory', () => {
  it('groups shapes under their category, in category order, skipping empty ones', () => {
    const groups = byCategory(SHAPES)
    expect(groups.map((g) => g.id)).toEqual(['basic', 'process', 'architecture', 'annotation'])
    expect(groups.flatMap((g) => g.shapes)).toHaveLength(SHAPES.length)
    expect(byCategory(searchShapes('queue')).map((g) => g.id)).toEqual(['architecture'])
  })
})

describe('recently used', () => {
  it('puts the latest first, without duplicates, up to a limit', () => {
    let recent: string[] = []
    for (const id of ['rectangle', 'diamond', 'rectangle', 'cloud']) recent = pushRecent(recent, id)
    expect(recent).toEqual(['cloud', 'rectangle', 'diamond'])
    for (const s of SHAPES) recent = pushRecent(recent, s.id)
    expect(recent).toHaveLength(MAX_RECENTS)
    expect(recent[0]).toBe(SHAPES.at(-1)!.id)
  })

  it('cleans stored values: known ids only, deduplicated, capped', () => {
    expect(cleanRecents(['diamond', 'hologram', 'diamond', 42, 'queue'])).toEqual(['diamond', 'queue'])
    expect(cleanRecents('nope')).toEqual([])
    expect(cleanRecents(null)).toEqual([])
    expect(cleanRecents(SHAPES.map((s) => s.id))).toHaveLength(MAX_RECENTS)
  })
})
