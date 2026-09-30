import { describe, expect, it } from 'vitest'
import type { Route, RoutableNode } from './routing'
import { spreadAttachments } from './spread'

const node = (id: string, x: number, y: number, width = 100, height = 60): RoutableNode => ({ id, position: { x, y }, size: { width, height } })
const route = (sourceSide: Route['sourceSide'], targetSide: Route['targetSide'], kind: Route['kind'] = 'direct'): Route => ({
  sourceSide,
  targetSide,
  kind,
  points: [],
  clear: true,
  blockers: [],
  basePoints: [],
})

describe('spreadAttachments', () => {
  const nodes = [node('hub', 0, 0), node('a', 400, -200), node('b', 400, 0), node('c', 400, 200)]
  const edges = ['a', 'b', 'c'].map((t) => ({ id: `e_${t}`, source: 'hub', target: t }))
  const routes = new Map(edges.map((e) => [e.id, route('right', 'left')]))

  it('spaces connectors sharing a side evenly along it, ordered by where they go', () => {
    const spread = spreadAttachments(nodes, edges, routes)
    // Right side is 60 tall: points at 1/4, 2/4, 3/4 of it, i.e. -15, 0, +15 from the middle.
    expect(spread.get('e_a')!.source).toBe(-15)
    expect(spread.get('e_b')!.source).toBe(0)
    expect(spread.get('e_c')!.source).toBe(15)
  })

  it('leaves a lone connector on a side in the middle', () => {
    const spread = spreadAttachments(nodes, edges, routes)
    for (const e of edges) expect(spread.get(e.id)!.target).toBe(0)
  })

  it('does not move the ends of routed detours', () => {
    const detour = new Map(routes)
    detour.set('e_a', route('right', 'left', 'detour'))
    const spread = spreadAttachments(nodes, edges, detour)
    expect(spread.get('e_a')).toEqual({ source: 0, target: 0 })
    expect(spread.get('e_b')!.source).toBe(-10)
    expect(spread.get('e_c')!.source).toBe(10)
  })

  it('spreads along the width for top and bottom sides', () => {
    const below = [node('top', 0, 0, 120, 60), node('l', -300, 300), node('r', 300, 300)]
    const es = [
      { id: 'l', source: 'top', target: 'l' },
      { id: 'r', source: 'top', target: 'r' },
    ]
    const spread = spreadAttachments(below, es, new Map(es.map((e) => [e.id, route('bottom', 'top')])))
    expect(spread.get('l')!.source).toBe(-20)
    expect(spread.get('r')!.source).toBe(20)
  })

  it('reuses unchanged results so edges are not redrawn needlessly', () => {
    const previous = spreadAttachments(nodes, edges, routes)
    const next = spreadAttachments(nodes, edges, routes, previous)
    for (const e of edges) expect(next.get(e.id)).toBe(previous.get(e.id))
  })
})
