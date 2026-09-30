import { beforeEach, describe, expect, it } from 'vitest'
import { fixtures, stencilFixtures } from '@/fixtures'
import { DiagramSchema, parseDiagram, type Diagram } from '@/schema/diagram'
import { useDiagramStore } from '@/store/diagramStore'
import { extractStencilContent, placeStencil } from './fragment'
import { parseStencil, StencilContentSchema, type StencilContent } from './format'

const store = () => useDiagramStore.getState()
const issues = (d: Diagram) => DiagramSchema.safeParse(d).error?.issues ?? []
const content = (d: Diagram, ids: string[]): StencilContent => {
  const r = extractStencilContent(d, ids)
  if (!r.ok) throw new Error(r.reason)
  return r.content
}

describe('saving a selection as stencil content', () => {
  const container = parseDiagram(fixtures.container)
  const pool = parseDiagram(fixtures['swimlane-pool'])
  const layered = parseDiagram(fixtures.layers)

  it('keeps only edges with both ends included', () => {
    const c = content(container, ['n_orders', 'n_payments'])
    expect(c.edges.map((e) => e.id)).toEqual(['e_orders_payments'])
  })

  it('moves the bounding box top-left to 0,0', () => {
    const c = content(container, ['n_client', 'n_orders'])
    expect(c.nodes.find((n) => n.id === 'n_client')!.position).toEqual({ x: 0, y: 0 })
    expect(c.nodes.find((n) => n.id === 'n_orders')!.position).toEqual({ x: 224, y: 20 })
  })

  it('cuts links to groups that are not saved', () => {
    const c = content(container, ['n_orders'])
    expect(c.groups).toEqual([])
    expect(c.nodes[0]!.groupId).toBeUndefined()
    expect(StencilContentSchema.safeParse(c).success).toBe(true)
  })

  it('a selected group brings its members and nested groups', () => {
    const c = content(container, ['g_backend'])
    expect(c.groups.map((g) => g.id)).toEqual(['g_backend'])
    expect(c.nodes.map((n) => n.id).sort()).toEqual(['n_orders', 'n_payments', 'n_store'])
    expect(c.nodes.every((n) => n.groupId === 'g_backend')).toBe(true)
    expect(c.groups[0]!.position).toEqual({ x: 0, y: 0 })
  })

  it('a pool brings its lanes; a lane alone is refused', () => {
    const c = content(pool, ['g_pool'])
    expect(c.groups.map((g) => g.id).sort()).toEqual(['g_lane_channels', 'g_lane_data', 'g_lane_integration', 'g_pool'])
    expect(c.nodes).toHaveLength(6)
    expect(c.edges).toHaveLength(5)
    expect(extractStencilContent(pool, ['g_lane_data'])).toEqual({ ok: false, reason: 'lane-only' })
    expect(extractStencilContent(pool, [])).toEqual({ ok: false, reason: 'nothing' })
    expect(StencilContentSchema.safeParse(c).success).toBe(true)
  })

  it('strips layers and locks but keeps notes, styles, sizes, shape ids and pinned sides', () => {
    const locked = { ...layered, nodes: layered.nodes.map((n) => ({ ...n, locked: true, notes: `note ${n.id}` })) }
    const c = content(locked, ['n_firewall', 'n_note', 'g_zone'])
    for (const item of [...c.nodes, ...c.edges, ...c.groups]) expect(item).not.toHaveProperty('layerId')
    expect(c.nodes.every((n) => !n.locked)).toBe(true)
    const note = c.nodes.find((n) => n.id === 'n_note')!
    expect(note).toMatchObject({ type: 'sticky-note', size: { width: 150, height: 150 }, notes: 'note n_note', style: { fill: 'token:swatch-amber-soft' } })
    const unknown = parseDiagram(fixtures['unknown-shape'])
    const u = content(unknown, ['n_future', 'n_known'])
    expect(u.nodes[0]!.type).toBe('hologram')
    expect(u.edges[0]!.sourceHandle).toBe('right')
  })
})

describe('placing stencil content', () => {
  const stencil = parseStencil(stencilFixtures.current)
  const d = parseDiagram(fixtures.container)

  it('adds copies with new ids and remapped edges, groupId and parentId', () => {
    const nested = parseDiagram({
      ...(fixtures.container as object),
      groups: [
        { id: 'outer', label: 'Outer', kind: 'container', position: { x: 0, y: 0 }, size: { width: 700, height: 300 } },
        { id: 'g_backend', label: 'Inner', kind: 'container', parentId: 'outer', position: { x: 10, y: 10 }, size: { width: 600, height: 220 } },
      ],
    })
    const c = content(nested, ['outer'])
    const { diagram, ids } = placeStencil(d, c, { x: 1000, y: 1000 }, 'default')
    expect(issues(diagram)).toEqual([])
    const added = new Set(ids)
    const oldIds = new Set([...d.nodes, ...d.edges, ...d.groups].map((i) => i.id))
    expect(ids.some((id) => oldIds.has(id))).toBe(false)
    const groups = diagram.groups.filter((g) => added.has(g.id))
    const inner = groups.find((g) => g.parentId)!
    expect(added.has(inner.parentId!)).toBe(true)
    const nodes = diagram.nodes.filter((n) => added.has(n.id))
    expect(nodes.every((n) => n.groupId === inner.id)).toBe(true)
    for (const e of diagram.edges.filter((e) => added.has(e.id))) {
      expect(added.has(e.source) && added.has(e.target)).toBe(true)
    }
  })

  it('centres on the point, snapping the top-left to the grid', () => {
    const { diagram, ids } = placeStencil(d, stencil.content, { x: 505, y: 303 }, 'default', 20)
    const group = diagram.groups.find((g) => g.id === ids[0])!
    // Content is 380×170: centred top-left would be 315, 218 → snapped to 320, 220.
    expect(group.position).toEqual({ x: 320, y: 220 })
  })
})

describe('insertStencil (store)', () => {
  const stencil = parseStencil(stencilFixtures.current)

  beforeEach(() => {
    store().load(fixtures.layers, { undoable: false })
    store().setActiveLayer('default')
  })

  it('inserts on the active layer, unlocked, selected, as one undo step, and stays valid', () => {
    store().setActiveLayer('l_security')
    const before = store().diagram
    const ids = store().insertStencil({ ...stencil.content, nodes: stencil.content.nodes.map((n) => ({ ...n, locked: true })) }, { x: 0, y: 0 })!
    expect(ids).toHaveLength(4)
    expect(store().selection).toEqual(ids)
    const d = store().diagram
    expect(issues(d)).toEqual([])
    const added = [...d.nodes, ...d.edges, ...d.groups].filter((i) => ids.includes(i.id))
    expect(added.every((i) => i.layerId === 'l_security')).toBe(true)
    expect(d.nodes.filter((n) => ids.includes(n.id)).every((n) => !n.locked)).toBe(true)
    store().undo()
    expect(store().diagram).toBe(before)
    store().redo()
    expect(store().diagram.nodes).toHaveLength(before.nodes.length + 2)
  })

  it('is blocked when the active layer is hidden or locked', () => {
    const before = store().diagram
    store().setActiveLayer('l_security')
    store().setLayerLocked('l_security', true)
    store().setActiveLayer('l_security')
    expect(store().activeLayerProblem()).toBe('locked')
    expect(store().insertStencil(stencil.content, { x: 0, y: 0 })).toBeNull()
    store().setLayerLocked('l_security', false)
    store().setLayerVisible('l_security', false)
    store().setActiveLayer('l_security')
    expect(store().activeLayerProblem()).toBe('hidden')
    expect(store().insertStencil(stencil.content, { x: 0, y: 0 })).toBeNull()
    expect(store().diagram.nodes).toEqual(before.nodes)
    expect(store().past).toHaveLength(0)
  })

  it('works with the other editing actions afterwards: align, duplicate, lock, delete', () => {
    const ids = store().insertStencil(stencil.content, { x: 0, y: 0 })!
    const nodeIds = store().diagram.nodes.filter((n) => ids.includes(n.id)).map((n) => n.id)
    store().setSelection(nodeIds)
    store().alignSelection('top')
    expect(store().duplicateSelection()).toHaveLength(3)
    store().setLocked(nodeIds, true)
    store().deleteElements(nodeIds)
    expect(store().diagram.nodes.filter((n) => nodeIds.includes(n.id))).toHaveLength(2)
    expect(issues(store().diagram)).toEqual([])
  })
})
