import { describe, expect, it } from 'vitest'
import { fixtures } from '@/fixtures'
import { parseDiagram, type Diagram } from '@/schema/diagram'
import { guideTargets, movedEdges, snapDrag, snapResize } from './guideTargets'
import { buildRenderModel } from './renderModel'

const load = (name: string) => parseDiagram(fixtures[name])
const ids = (t: { targets: { id: string }[] }) => t.targets.map((x) => x.id).sort()
const ctx = { zoom: 1, guides: true, grid: 0 }

/*
 * container: g_backend (0,0 600x220) holds n_orders, n_payments and n_store; n_client is outside.
 * layers: n_note is on a hidden layer; g_zone holds n_api and n_db.
 */

describe('guideTargets', () => {
  it('skips items on hidden layers', () => {
    const d = load('layers')
    const t = guideTargets(d, buildRenderModel(d), ['n_client'])
    expect(ids(t)).toEqual(['g_zone', 'n_api', 'n_db', 'n_firewall'])
  })

  it('includes locked items', () => {
    const d = load('container')
    const locked: Diagram = { ...d, nodes: d.nodes.map((n) => (n.id === 'n_store' ? { ...n, locked: true } : n)) }
    expect(ids(guideTargets(locked, buildRenderModel(locked), ['n_client']))).toContain('n_store')
  })

  it('excludes the moving items', () => {
    const d = load('container')
    expect(ids(guideTargets(d, buildRenderModel(d), ['n_orders', 'n_client']))).toEqual(['g_backend', 'n_payments', 'n_store'])
  })

  it('excludes everything inside a moving group', () => {
    const d = load('container')
    expect(ids(guideTargets(d, buildRenderModel(d), ['g_backend']))).toEqual(['n_client'])
  })

  it('includes group frames', () => {
    const d = load('container')
    expect(ids(guideTargets(d, buildRenderModel(d), ['n_client']))).toContain('g_backend')
  })

  it('limits targets to the view plus a margin', () => {
    const d = load('container')
    const model = buildRenderModel(d)
    // A view from x -250 to -150 shows only n_client; the group starts at 0 and n_orders at 24.
    const view = { x: -250, y: 0, width: 100, height: 200 }
    expect(ids(guideTargets(d, model, ['n_payments'], view, 0))).toEqual(['n_client'])
    expect(ids(guideTargets(d, model, ['n_payments'], view, 200))).toEqual(['g_backend', 'n_client', 'n_orders'])
  })

  it('offers the diagram centre of everything drawn except the moving items', () => {
    const d = load('container')
    const t = guideTargets(d, buildRenderModel(d), ['n_client'])
    // Without n_client, the drawn items are the group (0,0 600x220) and its members.
    expect(t.centres).toContainEqual({ kind: 'diagram', box: { x: 0, y: 0, width: 600, height: 220 } })
  })

  it('offers the container centre when moving inside a group', () => {
    const d = load('container')
    const t = guideTargets(d, buildRenderModel(d), ['n_orders', 'n_payments'])
    expect(t.centres).toContainEqual({ kind: 'container', id: 'g_backend', box: { x: 0, y: 0, width: 600, height: 220 } })
  })

  it('offers no container centre when the moving items are in different places', () => {
    const d = load('container')
    const t = guideTargets(d, buildRenderModel(d), ['n_orders', 'n_client'])
    expect(t.centres.map((c) => c.kind)).toEqual(['diagram'])
  })

  it('offers no container centre for a top-level group being moved', () => {
    const d = load('container')
    expect(guideTargets(d, buildRenderModel(d), ['g_backend']).centres.map((c) => c.kind)).toEqual(['diagram'])
  })
})

describe('snapDrag', () => {
  it('moves a whole selection by one offset, from its combined box', () => {
    const d = load('container')
    const model = buildRenderModel(d)
    const targets = guideTargets(d, model, ['n_orders', 'n_payments'])
    // Together they span x 3..359: the combined left edge is 3 from the group's left edge (0).
    const moves = new Map([
      ['n_orders', { x: 3, y: 80 }],
      ['n_payments', { x: 199, y: 80 }],
    ])
    const r = snapDrag(d, model, moves, targets, ctx)
    // Left edge 3 snaps to the group's left edge (0); the combined box is used, not each node.
    expect(r.moves.get('n_orders')).toEqual({ x: 0, y: 80 })
    expect(r.moves.get('n_payments')).toEqual({ x: 196, y: 80 })
    expect(r.guides?.snapX).toBe('guide')
  })

  it('aligns a node inside a group with shapes outside it, in absolute coordinates', () => {
    const d = load('container')
    const model = buildRenderModel(d)
    // n_client's right edge is at -104; move n_store so its left edge is at -101.
    const r = snapDrag(d, model, new Map([['n_store', { x: -101, y: 300 }]]), guideTargets(d, model, ['n_store']), ctx)
    expect(r.moves.get('n_store')?.x).toBe(-104)
  })

  it('snaps a dragged group by its frame', () => {
    const d = load('container')
    const model = buildRenderModel(d)
    // The frame's right edge (600 wide) lands 2 from n_client's left edge (-200).
    const r = snapDrag(d, model, new Map([['g_backend', { x: -798, y: 500 }]]), guideTargets(d, model, ['g_backend']), ctx)
    expect(r.moves.get('g_backend')?.x).toBe(-800)
  })

  it('uses the grid when no guide is close, snapping the first item', () => {
    const d = load('container')
    const model = buildRenderModel(d)
    const r = snapDrag(d, model, new Map([['n_client', { x: -1013, y: 1007 }]]), guideTargets(d, model, ['n_client']), { ...ctx, grid: 20 })
    expect(r.moves.get('n_client')).toEqual({ x: -1020, y: 1000 })
    expect(r.guides?.lines).toEqual([])
  })

  it('with guides off (Alt held) uses the grid even next to a guide', () => {
    const d = load('container')
    const model = buildRenderModel(d)
    const r = snapDrag(d, model, new Map([['n_store', { x: -101, y: 300 }]]), guideTargets(d, model, ['n_store']), { ...ctx, guides: false, grid: 20 })
    expect(r.moves.get('n_store')?.x).toBe(-100)
  })
})

describe('snapResize', () => {
  it('works out which edges moved', () => {
    const start = { x: 0, y: 0, width: 100, height: 50 }
    expect(movedEdges(start, { x: 0, y: 0, width: 120, height: 50 })).toEqual({ left: false, right: true, top: false, bottom: false })
    expect(movedEdges(start, { x: -10, y: 5, width: 110, height: 45 })).toEqual({ left: true, right: false, top: true, bottom: false })
  })

  it('snaps the moving edge of a node to a target', () => {
    const d = load('container')
    const model = buildRenderModel(d)
    // n_client is -200..-104 wide 96; drag its right edge to -2 (2 short of the group's left edge).
    const start = { x: -200, y: 60, width: 96, height: 128 }
    const r = snapResize(d, 'n_client', start, { ...start, width: 198 }, guideTargets(d, model, ['n_client']), ctx)
    expect(r.box.width).toBe(200)
    expect(r.snapX).toBe('guide')
  })

  it('matches another node’s width', () => {
    const d = load('container')
    const model = buildRenderModel(d)
    const start = { x: -200, y: 60, width: 96, height: 128 }
    // n_store is 120 wide. -200 + 117 = -83: no edge near, but the width is 3 off 120.
    const r = snapResize(d, 'n_client', start, { ...start, width: 117 }, guideTargets(d, model, ['n_client']), ctx)
    expect(r.box.width).toBe(120)
    expect(r.measures.some((m) => m.kind === 'size' && m.value === 120)).toBe(true)
  })
})
