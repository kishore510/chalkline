import { describe, expect, it } from 'vitest'
import { categoriesOf, cleanRecentStencils, MAX_RECENT_STENCILS, pushRecentStencil, searchItems } from './search'

const items = [
  { id: 'a', name: 'Load balancer', category: 'Architecture', tags: ['scaling'] },
  { id: 'b', name: 'Queue', category: 'Messaging', tags: ['events', 'async'] },
  { id: 'c', name: 'Decision', category: 'Process', tags: ['branch'] },
]

describe('stencil search', () => {
  it('matches names, categories and tags, every word', () => {
    expect(searchItems(items, 'load').map((i) => i.id)).toEqual(['a'])
    expect(searchItems(items, 'messaging').map((i) => i.id)).toEqual(['b'])
    expect(searchItems(items, 'ASYNC events').map((i) => i.id)).toEqual(['b'])
    expect(searchItems(items, 'queue branch')).toEqual([])
    expect(searchItems(items, '')).toHaveLength(3)
  })

  it('filters by category', () => {
    expect(searchItems(items, '', 'Process').map((i) => i.id)).toEqual(['c'])
    expect(searchItems(items, 'load', 'Process')).toEqual([])
    expect(categoriesOf(items)).toEqual(['Architecture', 'Messaging', 'Process'])
  })

  it('keeps recents newest first, unique and capped', () => {
    let r: string[] = []
    for (const id of ['a', 'b', 'a', 'c', 'd', 'e', 'f', 'g']) r = pushRecentStencil(r, id)
    expect(r).toEqual(['g', 'f', 'e', 'd', 'c', 'a'])
    expect(r).toHaveLength(MAX_RECENT_STENCILS)
    expect(cleanRecentStencils(['a', 'a', 3, '', 'b'])).toEqual(['a', 'b'])
    expect(cleanRecentStencils('nope')).toEqual([])
  })
})
