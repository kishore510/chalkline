import { beforeEach, describe, expect, it } from 'vitest'
import { fixtures } from '@/fixtures'
import { DiagramSchema, parseDiagram, type Diagram, type Position } from '@/schema/diagram'
import { useDiagramStore } from '@/store/diagramStore'
import { buildRenderModel } from './renderModel'
import { carryGroups, groupsInBox, screenRectToBox, selectAllIds } from './selectionScope'

/*
 * container: g_backend (0,0 600x220) holds n_orders (24,80), n_payments and n_store; n_client is outside.
 * swimlane-pool: g_pool holds three lanes, each with shapes.
 */

const load = (name: string) => parseDiagram(fixtures[name])

function carry(d: Diagram, selection: string[], moves: [string, Position][]) {
  return carryGroups(d, buildRenderModel(d), selection, new Map(moves))
}

describe('selectAllIds', () => {
  it('includes every shape, connector, group, pool and lane', () => {
    const d = load('swimlane-pool')
    const ids = selectAllIds(d)
    for (const item of [...d.nodes, ...d.edges, ...d.groups]) expect(ids).toContain(item.id)
  })

  it('selects groups through the store, leaving out what is on a hidden layer', () => {
    const d = load('layers')
    useDiagramStore.getState().load(d)
    useDiagramStore.getState().setSelection(selectAllIds(d))
    const selection = useDiagramStore.getState().selection
    expect(selection).toContain('g_zone')
    expect(selection).not.toContain('n_note')
  })
})

describe('acting on everything selected', () => {
  it.each(['swimlane-pool', 'container', 'layers', 'architecture'])('%s: select all then delete leaves a valid diagram', (name) => {
    const store = useDiagramStore.getState()
    store.load(load(name))
    store.setSelection(selectAllIds(useDiagramStore.getState().diagram))
    useDiagramStore.getState().deleteSelection()
    const d = useDiagramStore.getState().diagram
    expect(DiagramSchema.safeParse(d).success).toBe(true)
    expect(d.groups).toEqual([])
    expect(d.nodes.every((n) => n.id === 'n_note')).toBe(true)
  })

  it('select all then duplicate copies the groups too', () => {
    const store = useDiagramStore.getState()
    store.load(load('swimlane-pool'))
    store.setSelection(selectAllIds(useDiagramStore.getState().diagram))
    useDiagramStore.getState().duplicateSelection()
    const d = useDiagramStore.getState().diagram
    expect(DiagramSchema.safeParse(d).success).toBe(true)
    expect(d.groups.filter((g) => g.kind === 'container')).toHaveLength(2)
  })
})

describe('groupsInBox', () => {
  const model = buildRenderModel(load('swimlane-pool'))

  it('picks a pool and its lanes when the box surrounds them', () => {
    const ids = groupsInBox(model, { x: -10_000, y: -10_000, width: 20_000, height: 20_000 })
    expect(ids.sort()).toEqual(['g_lane_channels', 'g_lane_data', 'g_lane_integration', 'g_pool'])
  })

  it('needs the whole frame inside: a box within a group picks no groups', () => {
    const container = buildRenderModel(load('container'))
    expect(groupsInBox(container, { x: 10, y: 10, width: 200, height: 100 })).toEqual([])
    expect(groupsInBox(container, { x: -1, y: -1, width: 602, height: 222 })).toEqual(['g_backend'])
  })

  it('picks a single lane boxed on its own', () => {
    const lane = model.groups.find((v) => v.group.id === 'g_lane_data')!.box
    expect(groupsInBox(model, { x: lane.x - 1, y: lane.y - 1, width: lane.width + 2, height: lane.height + 2 })).toEqual(['g_lane_data'])
  })
})

describe('screenRectToBox', () => {
  it('undoes the pan and zoom', () => {
    expect(screenRectToBox({ x: 120, y: 60, width: 200, height: 100 }, [20, 10, 2])).toEqual({ x: 50, y: 25, width: 100, height: 50 })
  })
})

describe('carryGroups', () => {
  let d: Diagram
  beforeEach(() => {
    d = load('container')
  })

  it('moves a selected group by the dragged shape’s offset, its members with it', () => {
    const moves = carry(d, ['g_backend', 'n_orders', 'n_client'], [
      ['n_orders', { x: 74, y: 100 }],
      ['n_client', { x: -150, y: 80 }],
    ])
    expect(moves.get('g_backend')).toEqual({ x: 50, y: 20 })
    expect(moves.get('n_client')).toEqual({ x: -150, y: 80 })
    expect(moves.has('n_orders')).toBe(false)
  })

  it('leaves the drag alone when no group is selected', () => {
    const moves = carry(d, ['n_orders'], [['n_orders', { x: 30, y: 90 }]])
    expect([...moves]).toEqual([['n_orders', { x: 30, y: 90 }]])
  })

  it('leaves a selected group put when the dragged shape is not in the selection', () => {
    const moves = carry(d, ['g_backend'], [['n_client', { x: -150, y: 80 }]])
    expect([...moves]).toEqual([['n_client', { x: -150, y: 80 }]])
  })

  it('keeps React Flow’s own move for a group dragged by its header', () => {
    const moves = carry(d, ['g_backend'], [['g_backend', { x: 10, y: 10 }]])
    expect([...moves]).toEqual([['g_backend', { x: 10, y: 10 }]])
  })

  it('moves a selected pool, not its lanes, which go with it', () => {
    const pool = load('swimlane-pool')
    const shape = pool.nodes[0]!
    const lanes = pool.groups.filter((g) => g.kind === 'lane').map((g) => g.id)
    const to = { x: shape.position.x + 40, y: shape.position.y }
    const moves = carry(pool, ['g_pool', ...lanes, shape.id], [[shape.id, to]])
    const p = pool.groups.find((g) => g.id === 'g_pool')!.position
    expect(moves.get('g_pool')).toEqual({ x: p.x + 40, y: p.y })
    for (const lane of lanes) expect(moves.has(lane)).toBe(false)
    expect(moves.has(shape.id)).toBe(false)
  })

  it('does not carry a locked group', () => {
    const locked = { ...d, groups: d.groups.map((g) => ({ ...g, locked: true })) }
    const moves = carry(locked, ['g_backend', 'n_client'], [['n_client', { x: -150, y: 80 }]])
    expect([...moves]).toEqual([['n_client', { x: -150, y: 80 }]])
  })
})
