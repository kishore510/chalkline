import { describe, expect, it } from 'vitest'
import { fixtures } from '@/fixtures'
import { parseDiagram, type Diagram } from '@/schema/diagram'
import { setGroupCollapsed } from '@/store/groups'
import { buildRenderModel, collapsedBox } from './renderModel'
import { routeEdge } from './routing'

const container = () => parseDiagram(fixtures.container)
const pool = () => parseDiagram(fixtures['swimlane-pool'])

describe('buildRenderModel', () => {
  it('shows everything when nothing is collapsed, groups first and parents first', () => {
    const model = buildRenderModel(pool())
    expect(model.groups.map((v) => v.group.id)).toEqual(['g_pool', 'g_lane_channels', 'g_lane_integration', 'g_lane_data'])
    expect(model.groups.map((v) => v.depth)).toEqual([0, 1, 1, 1])
    expect(model.hiddenNodes.size).toBe(0)
    expect(model.edges).toEqual(pool().edges)
  })

  it('puts headers on the left for horizontal pools and lanes, on top for plain containers', () => {
    expect(buildRenderModel(pool()).groups.every((v) => v.side === 'left')).toBe(true)
    expect(buildRenderModel(container()).groups[0]!.side).toBe('top')
  })

  it('collapsed: hides members, shrinks to the header, and ends connectors on the group', () => {
    const d = setGroupCollapsed(container(), 'g_backend', true)
    const model = buildRenderModel(d)
    expect([...model.hiddenNodes].sort()).toEqual(['n_orders', 'n_payments', 'n_store'])
    expect(model.groups[0]!.box).toEqual(collapsedBox(d.groups[0]!))
    expect(model.groups[0]!.box.height).toBe(40)
    // client -> orders now ends on the group; the two internal connectors disappear.
    expect(model.edges.map((e) => [e.id, e.source, e.target])).toEqual([['e_client_orders', 'n_client', 'g_backend']])
    expect(model.routingNodes.map((n) => n.id).sort()).toEqual(['g_backend', 'n_client'])
    // The connector routes to the group's header bar.
    const route = routeEdge(model.routingNodes, model.edges[0]!)
    expect(route.points.at(-1)!.x).toBeLessThanOrEqual(600)
  })

  it('expanding restores exactly what was there', () => {
    const d = container()
    const round = setGroupCollapsed(setGroupCollapsed(d, 'g_backend', true), 'g_backend', false)
    expect(round.groups).toEqual(d.groups)
    const model = buildRenderModel(round)
    expect(model.hiddenNodes.size).toBe(0)
    expect(model.edges).toEqual(d.edges)
  })

  it('a collapsed pool hides its lanes too', () => {
    const d: Diagram = setGroupCollapsed(pool(), 'g_pool', true)
    const model = buildRenderModel(d)
    expect(model.groups.map((v) => v.group.id)).toEqual(['g_pool'])
    expect(model.hiddenNodes.size).toBe(6)
    expect(model.edges).toEqual([])
  })

  it('reuses edge objects between builds so routes are not recomputed', () => {
    const d = setGroupCollapsed(container(), 'g_backend', true)
    expect(buildRenderModel(d).edges[0]).toBe(buildRenderModel(d).edges[0])
    expect(buildRenderModel(d).routingNodes.at(-1)).toBe(buildRenderModel(d).routingNodes.at(-1))
  })

  it('treats groups as non-obstacles: routes across an expanded group stay direct', () => {
    const d = container()
    const model = buildRenderModel(d)
    const route = routeEdge(model.routingNodes, model.edges[0]!)
    expect(route.kind).toBe('direct')
  })
})
