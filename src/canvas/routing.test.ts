import { describe, expect, it } from 'vitest'
import { floatingEndpoints } from './floating'
import { createRouteCache, pathIsClear, routeEdge, type RoutableEdge, type RoutableNode } from './routing'

const node = (id: string, x: number, y: number, width = 100, height = 60): RoutableNode => ({ id, position: { x, y }, size: { width, height } })
const edge = (overrides: Partial<RoutableEdge> = {}): RoutableEdge => ({ id: 'e', source: 'a', target: 'b', style: {}, ...overrides })
const obstacles = (nodes: RoutableNode[], e: RoutableEdge) => nodes.filter((n) => n.id !== e.source && n.id !== e.target)

describe('routeEdge', () => {
  it('keeps the nearest-sides route when nothing is in the way', () => {
    const nodes = [node('a', 0, 0), node('b', 400, 150), node('far', 0, 600)]
    const route = routeEdge(nodes, edge())
    const nearest = floatingEndpoints({ x: 0, y: 0, width: 100, height: 60 }, { x: 400, y: 150, width: 100, height: 60 })
    expect(route).toMatchObject({ sourceSide: nearest.sourceSide, targetSide: nearest.targetSide, kind: 'direct', clear: true })
  })

  it('goes around a node sitting on the straight path', () => {
    const nodes = [node('a', 0, 0), node('b', 600, 0), node('blocker', 250, 0)]
    const route = routeEdge(nodes, edge())
    expect([route.sourceSide, route.targetSide]).not.toEqual(['right', 'left'])
    expect(route.clear).toBe(true)
    expect(pathIsClear(route.points, obstacles(nodes, edge()), 8)).toBe(true)
  })

  it('takes a detour when every side pair is blocked but a lane around the blocker is free', () => {
    const nodes = [node('a', 0, 0), node('b', 600, 0), node('wall', 250, -120, 100, 300)]
    const route = routeEdge(nodes, edge())
    expect(route.kind).toBe('detour')
    expect(route.clear).toBe(true)
    expect(pathIsClear(route.points, obstacles(nodes, edge()), 8)).toBe(true)
  })

  it('never changes a pinned end', () => {
    const nodes = [node('a', 0, 0), node('b', 600, 0), node('blocker', 250, 0)]
    const route = routeEdge(nodes, edge({ sourceHandle: 'right' }))
    expect(route.sourceSide).toBe('right')
    expect(route.clear).toBe(true)
  })

  it('leaves edges with both ends pinned alone, even if blocked', () => {
    const nodes = [node('a', 0, 0), node('b', 600, 0), node('blocker', 250, 0)]
    const route = routeEdge(nodes, edge({ sourceHandle: 'right', targetHandle: 'left' }))
    expect(route).toMatchObject({ sourceSide: 'right', targetSide: 'left', kind: 'direct' })
  })

  it('falls back to the shortest (nearest-sides) path when nothing is clear', () => {
    // b is boxed in on all sides.
    const nodes = [node('a', 0, 0), node('b', 600, 0), node('n', 560, -400, 180, 360), node('s', 560, 100, 180, 360), node('w', 520, -400, 30, 860), node('e', 750, -400, 30, 860)]
    const route = routeEdge(nodes, edge())
    expect(route).toMatchObject({ sourceSide: 'right', targetSide: 'left', kind: 'direct', clear: false })
  })

  it('attaches at side midpoints for nodes of different sizes', () => {
    const nodes = [node('a', 0, 100, 40, 40), node('b', 300, 0, 120, 400)]
    const route = routeEdge(nodes, edge())
    expect([route.sourceSide, route.targetSide]).toEqual(['right', 'left'])
    expect(route.points[0]).toEqual({ x: 40, y: 120 })
    expect(route.points.at(-1)).toEqual({ x: 300, y: 200 })
  })

  it('models straight lines as a single segment', () => {
    const nodes = [node('a', 0, 0), node('b', 400, 0)]
    expect(routeEdge(nodes, edge({ style: { lineType: 'straight' } })).points).toHaveLength(2)
  })
})

describe('createRouteCache', () => {
  const diagram = (nodes: RoutableNode[], edges: RoutableEdge[]) => ({ nodes, edges })

  it('reuses routes for edges unaffected by a moved node', () => {
    const a = node('a', 0, 0)
    const b = node('b', 400, 0)
    const c = node('c', 0, 400)
    const d = node('d', 400, 400)
    const ab = edge({ id: 'ab', source: 'a', target: 'b' })
    const cd = edge({ id: 'cd', source: 'c', target: 'd' })
    const route = createRouteCache()
    const first = route(diagram([a, b, c, d], [ab, cd]))
    const second = route(diagram([a, b, c, { ...d, position: { x: 420, y: 420 } }], [ab, cd]))
    expect(second.get('ab')).toBe(first.get('ab'))
    expect(second.get('cd')).not.toBe(first.get('cd'))
  })

  it('re-routes an edge when a node moves into or out of its path', () => {
    const a = node('a', 0, 0)
    const b = node('b', 600, 0)
    const x = node('x', 250, 400)
    const ab = edge({ id: 'ab' })
    const route = createRouteCache()
    expect(route(diagram([a, b, x], [ab])).get('ab')!.kind).toBe('direct')
    const blocked = route(diagram([a, b, { ...x, position: { x: 250, y: 0 } }], [ab])).get('ab')!
    expect([blocked.sourceSide, blocked.targetSide]).not.toEqual(['right', 'left'])
    const freed = route(diagram([a, b, { ...x, position: { x: 250, y: 400 } }], [ab])).get('ab')!
    expect([freed.sourceSide, freed.targetSide]).toEqual(['right', 'left'])
  })
})
