import ELK from 'elkjs/lib/elk.bundled.js'
import { describe, expect, it } from 'vitest'
import { fixtures } from '@/fixtures'
import { createEmptyDiagram, parseDiagram, type Diagram, type DiagramNode } from '@/schema/diagram'
import { createEdge, createNode } from '@/schema/factories'
import { computeLayout, type LayoutOptions, type LayoutResult } from './computeLayout'

const elk = new ELK()
const base: LayoutOptions = { direction: 'right', spacing: 'normal' }

function diagramOf(ids: string[], links: [string, string][], extra: Partial<Diagram> = {}): Diagram {
  const nodes = ids.map((id, i) => createNode('rectangle', { x: (i % 5) * 37, y: Math.floor(i / 5) * 29 }, { id }))
  const edges = links.map(([s, t]) => createEdge(s, t, { id: `e_${s}_${t}` }))
  return { ...createEmptyDiagram(), nodes, edges, ...extra }
}

function ok(result: LayoutResult) {
  if (!result.ok) throw new Error(result.message)
  return result
}

type Box = { x: number; y: number; width: number; height: number }
const boxAt = (r: ReturnType<typeof ok>, n: DiagramNode): Box => ({ ...(r.nodes.get(n.id) ?? n.position), ...n.size })
const overlap = (a: Box, b: Box, gap = 0) => a.x < b.x + b.width + gap && b.x < a.x + a.width + gap && a.y < b.y + b.height + gap && b.y < a.y + a.height + gap

function expectNoOverlaps(boxes: Box[]) {
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(overlap(boxes[i]!, boxes[j]!)).toBe(false)
}

describe('computeLayout', () => {
  it('lays a chain out left to right on one row', async () => {
    const d = diagramOf(['a', 'b', 'c', 'd'], [['a', 'b'], ['b', 'c'], ['c', 'd']])
    const r = ok(await computeLayout(d, base, elk))
    const xs = ['a', 'b', 'c', 'd'].map((id) => r.nodes.get(id)!.x)
    const ys = ['a', 'b', 'c', 'd'].map((id) => r.nodes.get(id)!.y)
    expect([...xs].sort((p, q) => p - q)).toEqual(xs)
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(1)
    expectNoOverlaps(d.nodes.map((n) => boxAt(r, n)))
    expect(r.arranged).toBe(4)
  })

  it('lays a chain out top to bottom', async () => {
    const d = diagramOf(['a', 'b', 'c'], [['a', 'b'], ['b', 'c']])
    const r = ok(await computeLayout(d, { ...base, direction: 'down' }, elk))
    expect(r.nodes.get('a')!.y).toBeLessThan(r.nodes.get('b')!.y)
    expect(r.nodes.get('b')!.y).toBeLessThan(r.nodes.get('c')!.y)
  })

  it('fans out: the root comes before all its children, which do not overlap', async () => {
    const d = diagramOf(['root', 'c1', 'c2', 'c3', 'c4'], [['root', 'c1'], ['root', 'c2'], ['root', 'c3'], ['root', 'c4']])
    const r = ok(await computeLayout(d, base, elk))
    const rootRight = r.nodes.get('root')!.x + 160
    for (const c of ['c1', 'c2', 'c3', 'c4']) expect(r.nodes.get(c)!.x).toBeGreaterThanOrEqual(rootRight)
    expectNoOverlaps(d.nodes.map((n) => boxAt(r, n)))
  })

  it('orders a diamond dependency by layers', async () => {
    const d = diagramOf(['a', 'b', 'c', 'd'], [['a', 'b'], ['a', 'c'], ['b', 'd'], ['c', 'd']])
    const r = ok(await computeLayout(d, base, elk))
    const x = (id: string) => r.nodes.get(id)!.x
    expect(x('a')).toBeLessThan(x('b'))
    expect(x('a')).toBeLessThan(x('c'))
    expect(x('b')).toBeLessThan(x('d'))
    expect(x('c')).toBeLessThan(x('d'))
  })

  it('wider spacing spreads nodes further apart', async () => {
    const d = diagramOf(['a', 'b'], [['a', 'b']])
    const gap = async (spacing: LayoutOptions['spacing']) => {
      const r = ok(await computeLayout(d, { ...base, spacing }, elk))
      return r.nodes.get('b')!.x - r.nodes.get('a')!.x
    }
    expect(await gap('compact')).toBeLessThan(await gap('normal'))
    expect(await gap('normal')).toBeLessThan(await gap('roomy'))
  })

  it('lays out members inside their container and resizes it to fit', async () => {
    const d = parseDiagram(fixtures.container)
    const r = ok(await computeLayout(d, base, elk))
    const g = r.groups.get('g_backend')!
    for (const id of ['n_orders', 'n_payments', 'n_store']) {
      const n = d.nodes.find((x) => x.id === id)!
      const b = boxAt(r, n)
      expect(b.x).toBeGreaterThanOrEqual(g.x + 16)
      expect(b.y).toBeGreaterThanOrEqual(g.y + 16 + 40)
      expect(b.x + b.width).toBeLessThanOrEqual(g.x + g.width - 16 + 0.01)
      expect(b.y + b.height).toBeLessThanOrEqual(g.y + g.height - 16 + 0.01)
    }
    // The client outside doesn't sit on the container.
    const client = d.nodes.find((x) => x.id === 'n_client')!
    expect(overlap(boxAt(r, client), g)).toBe(false)
  })

  it('handles nested containers', async () => {
    const d = parseDiagram(fixtures.container)
    const nested: Diagram = {
      ...d,
      groups: [...d.groups, { id: 'g_inner', label: 'Inner', kind: 'container', parentId: 'g_backend', locked: false, collapsed: false, style: {}, position: { x: 200, y: 60 }, size: { width: 400, height: 140 } }],
      nodes: d.nodes.map((n) => (n.id === 'n_payments' || n.id === 'n_store' ? { ...n, groupId: 'g_inner' } : n)),
    }
    const r = ok(await computeLayout(nested, base, elk))
    const outer = r.groups.get('g_backend')!
    const inner = r.groups.get('g_inner')!
    expect(inner.x).toBeGreaterThanOrEqual(outer.x)
    expect(inner.y + inner.height).toBeLessThanOrEqual(outer.y + outer.height + 0.01)
    const store = nested.nodes.find((n) => n.id === 'n_store')!
    const b = boxAt(r, store)
    expect(b.x).toBeGreaterThanOrEqual(inner.x)
    expect(b.x + b.width).toBeLessThanOrEqual(inner.x + inner.width + 0.01)
  })

  it('never moves a locked node, and places nothing on top of it', async () => {
    const d = diagramOf(['a', 'b', 'c', 'd'], [['b', 'c'], ['c', 'd']])
    d.nodes[0] = { ...d.nodes[0]!, locked: true, position: { x: 40, y: 0 }, size: { width: 400, height: 300 } }
    const r = ok(await computeLayout(d, base, elk))
    expect(r.nodes.has('a')).toBe(false)
    expect(r.skipped.locked).toBe(1)
    const locked = { ...d.nodes[0]!.position, ...d.nodes[0]!.size }
    for (const id of ['b', 'c', 'd']) expect(overlap(boxAt(r, d.nodes.find((n) => n.id === id)!), locked, 8)).toBe(false)
  })

  it('applies nothing when there is no room clear of locked items', async () => {
    const d = diagramOf(['wall', 'b', 'c'], [['b', 'c']])
    d.nodes[0] = { ...d.nodes[0]!, locked: true, position: { x: -1000, y: -1000 }, size: { width: 3000, height: 3000 } }
    const r = await computeLayout(d, { ...base, searchLimit: 0 }, elk)
    expect(r.ok).toBe(false)
    expect(r.message).toMatch(/locked/i)
  })

  it('leaves swimlane pools and their contents alone, and says so', async () => {
    const pool = parseDiagram(fixtures['swimlane-pool'])
    const free = diagramOf(['x', 'y'], [['x', 'y']])
    const d: Diagram = { ...pool, nodes: [...pool.nodes, ...free.nodes.map((n) => ({ ...n, position: { x: n.position.x + 2000, y: n.position.y } }))], edges: [...pool.edges, ...free.edges] }
    const r = ok(await computeLayout(d, base, elk))
    expect(r.skipped.pools).toBe(1)
    for (const n of pool.nodes) expect(r.nodes.has(n.id)).toBe(false)
    for (const g of pool.groups) expect(r.groups.has(g.id)).toBe(false)
    expect(r.message).toMatch(/swimlane/i)
    // The free nodes don't land on the pool.
    const poolBox = { ...pool.groups[0]!.position, ...pool.groups[0]!.size }
    for (const id of ['x', 'y']) expect(overlap(boxAt(r, d.nodes.find((n) => n.id === id)!), poolBox)).toBe(false)
  })

  it('arranges only the selection when there is one; everything else stays and is avoided', async () => {
    const d = diagramOf(['a', 'b', 'c', 'd'], [['a', 'b'], ['c', 'd']])
    const r = ok(await computeLayout(d, { ...base, scope: ['a', 'b'] }, elk))
    expect([...r.nodes.keys()].sort()).toEqual(['a', 'b'])
    for (const fixed of ['c', 'd']) {
      const n = d.nodes.find((x) => x.id === fixed)!
      for (const moved of ['a', 'b']) expect(overlap(boxAt(r, d.nodes.find((x) => x.id === moved)!), { ...n.position, ...n.size })).toBe(false)
    }
  })

  it('snaps positions to the grid when asked', async () => {
    const d = diagramOf(['a', 'b', 'c'], [['a', 'b'], ['a', 'c']])
    const r = ok(await computeLayout(d, { ...base, grid: 20 }, elk))
    for (const p of r.nodes.values()) {
      expect(p.x % 20).toBe(0)
      expect(p.y % 20).toBe(0)
    }
  })

  it('does not mutate the diagram', async () => {
    const d = parseDiagram(fixtures.container)
    const copy = structuredClone(d)
    await computeLayout(d, base, elk)
    expect(d).toEqual(copy)
  })

  it('copes with about 300 nodes', { timeout: 60_000 }, async () => {
    const ids = Array.from({ length: 300 }, (_, i) => `n${i}`)
    const links: [string, string][] = ids.slice(1).map((id, i) => [`n${Math.floor(i / 3)}`, id])
    const d = diagramOf(ids, links)
    const r = ok(await computeLayout(d, base, elk))
    expect(r.arranged).toBe(300)
    // Spot-check overlaps among neighbours in the same layer.
    const boxes = d.nodes.map((n) => boxAt(r, n)).sort((a, b) => a.x - b.x || a.y - b.y)
    for (let i = 1; i < boxes.length; i++) expect(overlap(boxes[i - 1]!, boxes[i]!)).toBe(false)
  })

  it('leaves hidden shapes alone, does not avoid them, and says so', async () => {
    const d = parseDiagram(fixtures.layers)
    const r = ok(await computeLayout(d, base, elk))
    expect(r.nodes.has('n_note')).toBe(false)
    expect(r.skipped.hidden).toBe(1)
    expect(r.message).toMatch(/hidden/i)
  })

  it('treats shapes on a locked layer as fixed obstacles', async () => {
    const d = parseDiagram(fixtures.layers)
    const locked = { ...d, layers: d.layers.map((l) => (l.id === 'l_security' ? { ...l, locked: true } : l)) }
    const r = ok(await computeLayout(locked, base, elk))
    expect(r.nodes.has('n_firewall')).toBe(false)
    const fw = locked.nodes.find((n) => n.id === 'n_firewall')!
    for (const id of r.nodes.keys()) {
      const n = locked.nodes.find((x) => x.id === id)!
      expect(overlap(boxAt(r, n), { ...fw.position, ...fw.size })).toBe(false)
    }
  })
})

