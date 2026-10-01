import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fixtures } from '@/fixtures'
import { DiagramSchema, parseDiagram, type Diagram, type Position } from '@/schema/diagram'
import { useDiagramStore } from '@/store/diagramStore'
import { guideTargets, snapDrag, type SnapContext } from './guideTargets'
import { nudgeItems, nudgeStep, planNudge } from './nudge'
import { buildRenderModel } from './renderModel'

/*
 * container: g_backend (0,0 600x220) holds n_orders (24,80 160x80), n_payments and n_store;
 * n_client (-200,60 96x128) is outside.
 * layers: n_note is on a hidden layer; g_zone (on l_security) holds n_api and n_db.
 * swimlane-pool: g_pool holds three lanes, each with shapes.
 */

const load = (name: string) => parseDiagram(fixtures[name])
const guides: SnapContext = { zoom: 1, guides: true, grid: 0 }
const gridOnly: SnapContext = { zoom: 1, guides: false, grid: 20 }

function withNode(d: Diagram, id: string, patch: Partial<Diagram['nodes'][number]>): Diagram {
  return { ...d, nodes: d.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) }
}

function plan(d: Diagram, ids: string[], delta: Position, ctx: SnapContext) {
  const model = buildRenderModel(d)
  return planNudge(d, model, ids, delta, guideTargets(d, model, ids), ctx)
}

/** Where dragging `id` to `to` would land. */
function dragTo(d: Diagram, id: string, to: Position, ctx: SnapContext) {
  const model = buildRenderModel(d)
  return snapDrag(d, model, new Map([[id, to]]), guideTargets(d, model, [id]), ctx).moves.get(id)
}

describe('nudgeStep', () => {
  it('moves a grid square with the grid on, otherwise a pixel; Shift is bigger', () => {
    expect(nudgeStep(0, false)).toBe(1)
    expect(nudgeStep(0, true)).toBe(10)
    expect(nudgeStep(20, false)).toBe(20)
    expect(nudgeStep(20, true)).toBe(100)
  })
})

describe('planNudge snaps like a drag', () => {
  it('lands where a drag to the same spot lands (smart guides)', () => {
    // Right edge at -4: one pixel right brings it within reach of the group's left edge (x = 0).
    const d = withNode(load('container'), 'n_client', { position: { x: -100, y: 60 } })
    const nudged = plan(d, ['n_client'], { x: 1, y: 0 }, guides)
    const dragged = dragTo(d, 'n_client', { x: -99, y: 60 }, guides)
    expect(dragged?.x).toBe(-96)
    expect(nudged?.moves.get('n_client')?.x).toBe(dragged?.x)
    // An arrow key moves one way only: the drag would also snap y (centre 124 to 120), the nudge doesn't.
    expect(dragged?.y).toBe(56)
    expect(nudged?.moves.get('n_client')?.y).toBe(60)
    expect(nudged?.guides?.lines.every((l) => l.axis === 'x')).toBe(true)
  })

  it('lands where a drag lands (grid)', () => {
    const d = withNode(load('container'), 'n_client', { position: { x: -195, y: 60 } })
    for (const dx of [20, -20]) {
      const nudged = plan(d, ['n_client'], { x: dx, y: 0 }, gridOnly)
      expect(nudged?.moves.get('n_client')?.x).toBe(dragTo(d, 'n_client', { x: -195 + dx, y: 60 }, gridOnly)?.x)
    }
    expect(plan(d, ['n_client'], { x: 20, y: 0 }, gridOnly)?.moves.get('n_client')).toEqual({ x: -180, y: 60 })
  })

  it('steps off a guide it is sitting on instead of snapping back', () => {
    // Right edge exactly on the group's left edge.
    const d = withNode(load('container'), 'n_client', { position: { x: -96, y: 60 } })
    expect(dragTo(d, 'n_client', { x: -95, y: 60 }, guides)?.x).toBe(-96)
    expect(plan(d, ['n_client'], { x: 1, y: 0 }, guides)?.moves.get('n_client')).toEqual({ x: -95, y: 60 })
    expect(plan(d, ['n_client'], { x: -1, y: 0 }, guides)?.moves.get('n_client')).toEqual({ x: -97, y: 60 })
  })

  it('moves every item by the same offset', () => {
    const d = load('container')
    const nudged = plan(d, ['n_client', 'n_orders'], { x: 0, y: 10 }, { ...guides, guides: false })
    expect(nudged?.offset).toEqual({ x: 0, y: 10 })
    expect(nudged?.moves.get('n_client')).toEqual({ x: -200, y: 70 })
    expect(nudged?.moves.get('n_orders')).toEqual({ x: 24, y: 90 })
  })
})

describe('nudgeItems', () => {
  it('skips locked shapes, members of locked groups and shapes on locked layers', () => {
    const d = load('container')
    const model = (x: Diagram) => buildRenderModel(x)
    const locked = withNode(d, 'n_orders', { locked: true })
    expect(nudgeItems(locked, model(locked), ['n_orders', 'n_client'])).toEqual(['n_client'])
    const lockedGroup: Diagram = { ...d, groups: d.groups.map((g) => ({ ...g, locked: true })) }
    expect(nudgeItems(lockedGroup, model(lockedGroup), ['g_backend', 'n_payments', 'n_client'])).toEqual(['n_client'])
    const layers = load('layers')
    const lockedLayer: Diagram = { ...layers, layers: layers.layers.map((l) => (l.id === 'l_security' ? { ...l, locked: true } : l)) }
    expect(nudgeItems(lockedLayer, model(lockedLayer), ['n_firewall', 'g_zone', 'n_client'])).toEqual(['n_client'])
  })

  it('skips shapes on hidden layers and inside collapsed groups', () => {
    const layers = load('layers')
    expect(nudgeItems(layers, buildRenderModel(layers), ['n_note', 'n_client'])).toEqual(['n_client'])
    const d = load('container')
    const collapsed: Diagram = { ...d, groups: d.groups.map((g) => ({ ...g, collapsed: true })) }
    expect(nudgeItems(collapsed, buildRenderModel(collapsed), ['n_orders', 'g_backend'])).toEqual(['g_backend'])
  })

  it('moves a container with its contents and never a lane on its own', () => {
    const d = load('container')
    expect(nudgeItems(d, buildRenderModel(d), ['n_orders', 'g_backend'])).toEqual(['g_backend'])
    const pool = load('swimlane-pool')
    expect(nudgeItems(pool, buildRenderModel(pool), ['g_lane_data'])).toEqual([])
    expect(nudgeItems(pool, buildRenderModel(pool), ['g_pool', 'g_lane_data', 'n_bus'])).toEqual(['g_pool'])
  })

  it('plans nothing when everything selected is locked', () => {
    const d = withNode(load('container'), 'n_client', { locked: true })
    expect(plan(d, ['n_client'], { x: 1, y: 0 }, guides)).toBeNull()
    expect(plan(d, [], { x: 1, y: 0 }, guides)).toBeNull()
  })
})

describe('nudge store action', () => {
  const store = () => useDiagramStore.getState()
  const node = (id: string) => store().diagram.nodes.find((n) => n.id === id)
  const nudge = (ids: string[], delta: Position) => {
    const d = store().diagram
    const p = plan(d, ids, delta, { ...guides, guides: false })
    if (p) store().nudge(p.moves)
  }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-01T10:00:00Z'))
    store().load(fixtures.container, { undoable: false })
  })
  afterEach(() => vi.useRealTimers())

  it('moves a group and everything in it, keeping the diagram valid', () => {
    nudge(['g_backend'], { x: 10, y: 0 })
    expect(store().diagram.groups[0]?.position).toEqual({ x: 10, y: 0 })
    expect(node('n_orders')?.position).toEqual({ x: 34, y: 80 })
    expect(node('n_client')?.position).toEqual({ x: -200, y: 60 })
    expect(DiagramSchema.safeParse(store().diagram).success).toBe(true)
  })

  it('a burst of nudges is one undo step', () => {
    const before = store().diagram
    for (let i = 0; i < 12; i++) {
      nudge(['n_client'], { x: 1, y: 0 })
      vi.advanceTimersByTime(40)
    }
    nudge(['n_client'], { x: 0, y: 1 })
    expect(node('n_client')?.position).toEqual({ x: -188, y: 61 })
    expect(store().past).toHaveLength(1)
    store().undo()
    expect(store().diagram.nodes).toEqual(before.nodes)
  })

  it('a pause, another change, or other items start a new step', () => {
    nudge(['n_client'], { x: 1, y: 0 })
    vi.advanceTimersByTime(1500)
    nudge(['n_client'], { x: 1, y: 0 })
    expect(store().past).toHaveLength(2)
    nudge(['n_orders'], { x: 1, y: 0 })
    expect(store().past).toHaveLength(3)
    store().setNodeLabel('n_store', 'S')
    nudge(['n_orders'], { x: 1, y: 0 })
    expect(store().past).toHaveLength(5)
  })

  it('does not move locked items even if asked directly', () => {
    store().setLocked(['n_client'], true)
    const before = store().diagram
    store().nudge(new Map([['n_client', { x: 0, y: 0 }]]))
    expect(store().diagram).toBe(before)
  })
})
