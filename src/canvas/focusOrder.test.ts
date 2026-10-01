import { describe, expect, it } from 'vitest'
import { fixtures } from '@/fixtures'
import { createEmptyDiagram, parseDiagram, type Diagram } from '@/schema/diagram'
import { createNode } from '@/schema/factories'
import { connectorName, focusOrder, nextFocus, shapeName } from './focusOrder'
import { buildRenderModel } from './renderModel'

const order = (d: Diagram) => focusOrder(d, buildRenderModel(d))
const ids = (d: Diagram) => order(d).map((s) => s.id)

function grid(points: [string, number, number][]): Diagram {
  return { ...createEmptyDiagram(), nodes: points.map(([id, x, y]) => createNode('rectangle', { x, y }, { id, label: id })) }
}

describe('focusOrder', () => {
  it('reads rows top to bottom, each left to right, whatever the stored order', () => {
    // b sits a little lower than a but in the same row; c is on the next row, left of both.
    const d = grid([
      ['c', 0, 200],
      ['b', 300, 10],
      ['a', 0, 0],
      ['d', 300, 200],
    ])
    expect(ids(d)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('puts group frames before what they hold, then connectors last', () => {
    const d = parseDiagram(fixtures.container)
    const stops = order(d)
    expect(stops.map((s) => s.kind)).toEqual(expect.arrayContaining(['group', 'shape']))
    expect(stops.findIndex((s) => s.id === 'g_backend')).toBeLessThan(stops.findIndex((s) => s.id === 'n_orders'))
    const firstConnector = stops.findIndex((s) => s.kind === 'connector')
    if (firstConnector >= 0) expect(stops.slice(firstConnector).every((s) => s.kind === 'connector')).toBe(true)
  })

  it('skips shapes on hidden layers and inside collapsed groups', () => {
    const layers = parseDiagram(fixtures.layers)
    expect(ids(layers)).not.toContain('n_note')
    const d = parseDiagram(fixtures.container)
    const collapsed: Diagram = { ...d, groups: d.groups.map((g) => ({ ...g, collapsed: true })) }
    const stops = ids(collapsed)
    expect(stops).toContain('g_backend')
    expect(stops).not.toContain('n_orders')
    expect(stops).toContain('n_client')
  })

  it('includes every visible connector once', () => {
    const d = parseDiagram(fixtures['web-architecture'])
    const connectors = order(d).filter((s) => s.kind === 'connector')
    expect(connectors.map((c) => c.id).sort()).toEqual(buildRenderModel(d).edges.map((e) => e.id).sort())
  })
})

describe('nextFocus never traps focus', () => {
  const stops = [
    { id: 'a', kind: 'shape' as const },
    { id: 'b', kind: 'shape' as const },
    { id: 'e', kind: 'connector' as const },
  ]

  it('enters at the first stop from the canvas, and steps both ways', () => {
    expect(nextFocus(stops, null, false)?.id).toBe('a')
    expect(nextFocus(stops, 'a', false)?.id).toBe('b')
    expect(nextFocus(stops, 'e', true)?.id).toBe('b')
  })

  it('lets focus leave past either end, and from the canvas going back', () => {
    expect(nextFocus(stops, 'e', false)).toBeNull()
    expect(nextFocus(stops, 'a', true)).toBeNull()
    expect(nextFocus(stops, null, true)).toBeNull()
    expect(nextFocus([], null, false)).toBeNull()
  })

  it('treats a stop that has gone (deleted, hidden) as the canvas', () => {
    expect(nextFocus(stops, 'gone', false)?.id).toBe('a')
    expect(nextFocus(stops, 'gone', true)).toBeNull()
  })

  it('walking forward from the canvas visits every stop once, then leaves', () => {
    const d = parseDiagram(fixtures['web-architecture'])
    const all = order(d)
    const seen: string[] = []
    let at: string | null = null
    for (let i = 0; i < all.length + 5; i++) {
      const next = nextFocus(all, at, false)
      if (!next) break
      seen.push(next.id)
      at = next.id
    }
    expect(seen).toEqual(all.map((s) => s.id))
  })
})

describe('names', () => {
  it('shapes say their label and type; connectors say their ends and label', () => {
    expect(shapeName('Orders', 'database', false)).toBe('Orders, database')
    expect(shapeName('', 'rectangle', true)).toBe('Untitled, rectangle, locked')
    expect(shapeName('X', 'future-shape', false)).toBe('X, unknown shape')
    expect(connectorName('Web', 'API', 'HTTPS')).toBe('Connector from Web to API: HTTPS')
    expect(connectorName('Web', '', '')).toBe('Connector from Web to Untitled')
  })
})
