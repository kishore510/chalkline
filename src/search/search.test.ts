import { beforeEach, describe, expect, it } from 'vitest'
import { fixtures } from '@/fixtures'
import { createEmptyDiagram, DEFAULT_LAYER_ID, parseDiagram, type Diagram } from '@/schema/diagram'
import { createNode } from '@/schema/factories'
import { useDiagramStore } from '@/store/diagramStore'
import { normalise, searchDiagram, stepIndex } from './search'
import { currentTarget, useSearchStore } from './searchStore'

/*
 * layers: n_client "Client", n_api "API", n_db "Records" (both in g_zone), n_firewall "Firewall"
 * on l_security, n_note "Review access quarterly" on the hidden l_notes layer.
 */

const load = (name: string) => parseDiagram(fixtures[name])
const ids = (d: Diagram, q: string) => searchDiagram(d, q).hits.map((h) => h.id)

function diagramOf(nodes: { id: string; label: string; notes?: string; x: number; y: number }[]): Diagram {
  const d = createEmptyDiagram()
  return { ...d, nodes: nodes.map((n) => createNode('rectangle', { x: n.x, y: n.y }, { id: n.id, label: n.label, notes: n.notes ?? '' })) }
}

describe('searchDiagram', () => {
  it('matches labels and notes, ignoring case and accents', () => {
    const d = diagramOf([
      { id: 'a', label: 'Payment Service', x: 0, y: 0 },
      { id: 'b', label: 'Café', notes: 'Talks to the PAYMENT gateway', x: 0, y: 100 },
      { id: 'c', label: 'Other', x: 0, y: 200 },
    ])
    expect(searchDiagram(d, 'payment').hits).toEqual([
      { id: 'a', field: 'label' },
      { id: 'b', field: 'notes' },
    ])
    expect(ids(d, 'cafe')).toEqual(['b'])
    expect(ids(d, 'CAFÉ')).toEqual(['b'])
    expect(ids(d, '  ')).toEqual([])
    expect(ids(d, 'nothing like it')).toEqual([])
  })

  it('orders label matches before notes matches, each top to bottom then left to right', () => {
    const d = diagramOf([
      { id: 'notes-top', label: 'x', notes: 'queue', x: 0, y: 0 },
      { id: 'low', label: 'Queue 3', x: 0, y: 300 },
      { id: 'right', label: 'Queue 2', x: 400, y: 100 },
      { id: 'left', label: 'Queue 1', x: 0, y: 100 },
    ])
    expect(ids(d, 'queue')).toEqual(['left', 'right', 'low', 'notes-top'])
  })

  it('skips shapes on hidden layers but counts them, with their layers', () => {
    const d = load('layers')
    const result = searchDiagram(d, 'review')
    expect(result.hits).toEqual([])
    expect(result.hidden).toEqual({ count: 1, layerIds: ['l_notes'] })
    const shown: Diagram = { ...d, layers: d.layers.map((l) => ({ ...l, visible: true })) }
    expect(ids(shown, 'review')).toEqual(['n_note'])
    expect(searchDiagram(shown, 'review').hidden.count).toBe(0)
  })

  it('reports the outermost collapsed group hiding a match', () => {
    const d = load('container')
    const collapsed: Diagram = { ...d, groups: d.groups.map((g) => ({ ...g, collapsed: true })) }
    expect(searchDiagram(collapsed, 'orders').hits).toEqual([{ id: 'n_orders', field: 'label', collapsedIn: 'g_backend' }])
    expect(searchDiagram(d, 'orders').hits).toEqual([{ id: 'n_orders', field: 'label' }])
  })

  it('normalises white space', () => {
    expect(normalise('Two\n  Lines')).toBe('two lines')
  })
})

describe('stepIndex', () => {
  it('wraps both ways and starts from either end', () => {
    expect(stepIndex(2, 3, 1)).toBe(0)
    expect(stepIndex(0, 3, -1)).toBe(2)
    expect(stepIndex(-1, 3, 1)).toBe(0)
    expect(stepIndex(-1, 3, -1)).toBe(2)
    expect(stepIndex(0, 0, 1)).toBe(-1)
  })
})

describe('search on a large diagram', () => {
  const big = (count: number): Diagram => {
    const d = createEmptyDiagram()
    const nodes = Array.from({ length: count }, (_, i) =>
      createNode('rectangle', { x: (i % 40) * 200, y: Math.floor(i / 40) * 120 }, { id: `n${i}`, label: `Service ${i}`, notes: i % 7 === 0 ? `Owned by team ${i % 13}` : '' }),
    )
    return { ...d, nodes }
  }

  it('stays fast with 2,000 shapes and re-reads only what changed', () => {
    const d = big(2000)
    const cold = performance.now()
    expect(ids(d, 'service 1999')).toEqual(['n1999'])
    const coldMs = performance.now() - cold
    // Typing: one search per (debounced) keystroke.
    const warm = performance.now()
    for (const q of ['s', 'se', 'ser', 'serv', 'servi', 'servic', 'service', 'service 1', 'team 5']) searchDiagram(d, q)
    const warmMs = (performance.now() - warm) / 9
    // One shape edited: the rest keep their cached text.
    const edited: Diagram = { ...d, nodes: d.nodes.map((n, i) => (i === 5 ? { ...n, label: 'Gateway' } : n)) }
    expect(ids(edited, 'gateway')).toEqual(['n5'])
    expect(searchDiagram(d, 'service').hits).toHaveLength(2000)
    // Generous bounds for a Raspberry Pi; typical runs are a few milliseconds.
    expect(coldMs).toBeLessThan(250)
    expect(warmMs).toBeLessThan(50)
  })
})

describe('search store', () => {
  const search = () => useSearchStore.getState()
  const diagram = () => useDiagramStore.getState()

  beforeEach(() => {
    search().close()
    diagram().load(fixtures.layers, { undoable: false })
  })

  it('steps through results and wraps', () => {
    search().openSearch()
    search().setQuery('r')
    const hits = search().result.hits.map((h) => h.id)
    expect(hits.length).toBeGreaterThan(1)
    expect(currentTarget(search())).toBe(hits[0])
    search().previous()
    expect(currentTarget(search())).toBe(hits.at(-1))
    search().next()
    expect(currentTarget(search())).toBe(hits[0])
  })

  it('is view state: never changes the document or the undo history, and closing clears it', () => {
    const before = diagram().diagram
    search().openSearch()
    search().setQuery('api')
    search().next()
    expect(search().matchIds.has('n_api')).toBe(true)
    expect(diagram().diagram).toBe(before)
    expect(diagram().past).toHaveLength(0)
    search().close()
    expect(search().query).toBe('')
    expect(search().matchIds.size).toBe(0)
    expect(currentTarget(search())).toBeUndefined()
  })

  it('follows edits while open, keeping the current result', () => {
    search().openSearch()
    search().setQuery('fire')
    expect(currentTarget(search())).toBe('n_firewall')
    diagram().setNodeLabel('n_client', 'Firefox client')
    expect(search().result.hits.map((h) => h.id)).toEqual(['n_client', 'n_firewall'])
    expect(currentTarget(search())).toBe('n_firewall')
  })

  it('shows hidden layers with matches without an undo step', () => {
    search().openSearch()
    search().setQuery('review')
    expect(search().result.hidden.count).toBe(1)
    search().showHiddenMatches()
    expect(diagram().past).toHaveLength(0)
    expect(diagram().diagram.layers.find((l) => l.id === 'l_notes')?.visible).toBe(true)
    expect(search().result.hits.map((h) => h.id)).toEqual(['n_note'])
    expect(search().result.hidden.count).toBe(0)
  })

  it('expands collapsed groups around the current result in one undo step', () => {
    diagram().setCollapsed('g_zone', true)
    const steps = diagram().past.length
    search().openSearch()
    search().setQuery('records')
    expect(currentTarget(search())).toBe('g_zone')
    search().expandCurrent()
    expect(diagram().past.length).toBe(steps + 1)
    expect(diagram().diagram.groups.find((g) => g.id === 'g_zone')?.collapsed).toBe(false)
    expect(currentTarget(search())).toBe('n_db')
  })

  it('searches the default layer too', () => {
    search().openSearch()
    search().setQuery('client')
    expect(diagram().diagram.nodes.find((n) => n.id === 'n_client')?.layerId ?? DEFAULT_LAYER_ID).toBe(DEFAULT_LAYER_ID)
    expect(currentTarget(search())).toBe('n_client')
  })
})
