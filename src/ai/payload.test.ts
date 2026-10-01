import { describe, expect, it } from 'vitest'
import { fixtures } from '@/fixtures'
import { parseDiagram, type Diagram } from '@/schema/diagram'
import { describeSize, estimateSize } from './estimate'
import { AI_MODELS } from './models'
import { buildPayload } from './payload'

const web = parseDiagram(fixtures['web-architecture'])
const layered = parseDiagram(fixtures.layers)
const pool = parseDiagram(fixtures['swimlane-pool'])

/** A small diagram written out here, so the expected payload is plain to see. */
const small: Diagram = parseDiagram({
  schemaVersion: 5,
  meta: { title: 'Checkout', created: '2026-10-01T00:00:00.000Z', updated: '2026-10-01T00:00:00.000Z' },
  nodes: [
    { id: 'a', type: 'rectangle', position: { x: 10.4, y: 20.6 }, size: { width: 120, height: 60 }, label: 'Web', notes: 'Public', style: { fill: '#ff0000', fontSize: 20 } },
    { id: 'b', type: 'database', position: { x: 200, y: 20 }, size: { width: 120, height: 80 }, label: 'Orders', notes: '' },
    { id: 'c', type: 'text', position: { x: 400, y: 20 }, size: { width: 80, height: 40 }, label: '  ' },
  ],
  edges: [
    { id: 'e1', source: 'a', target: 'b', label: 'writes', notes: 'Async', style: { dashed: true } },
    { id: 'e2', source: 'b', target: 'c' },
  ],
  groups: [],
  layers: [{ id: 'default', name: 'Base', visible: true, locked: false }],
})

describe('payload builder', () => {
  it('sends ids, labels, shape ids and edges only: no styling, layers, positions or timestamps', () => {
    const { payload, json, counts } = buildPayload(small, { includeNotes: false })
    expect(payload).toEqual({
      title: 'Checkout',
      nodes: [
        { id: 'a', shape: 'rectangle', label: 'Web', notes: undefined, group: undefined },
        { id: 'b', shape: 'database', label: 'Orders', notes: undefined, group: undefined },
        { id: 'c', shape: 'text', label: undefined, notes: undefined, group: undefined },
      ],
      edges: [
        { id: 'e1', from: 'a', to: 'b', dir: undefined, label: 'writes', notes: undefined },
        { id: 'e2', from: 'b', to: 'c', dir: undefined, label: undefined, notes: undefined },
      ],
    })
    expect(json).toBe(
      '{"title":"Checkout","nodes":[{"id":"a","shape":"rectangle","label":"Web"},{"id":"b","shape":"database","label":"Orders"},{"id":"c","shape":"text"}],"edges":[{"id":"e1","from":"a","to":"b","label":"writes"},{"id":"e2","from":"b","to":"c"}]}',
    )
    for (const word of ['style', 'fill', 'fontSize', 'position', 'layer', 'created', 'dashed', '"x"', '\n', '  ']) expect(json).not.toContain(word)
    expect(counts).toEqual({ nodes: 3, edges: 2, groups: 0, notes: 0, notesLeftOut: 2 })
  })

  it('the notes toggle adds notes, and only non-empty ones', () => {
    const off = buildPayload(small, { includeNotes: false })
    const on = buildPayload(small, { includeNotes: true })
    expect(off.json).not.toContain('Public')
    expect(on.json).toContain('"notes":"Public"')
    expect(on.json).toContain('"notes":"Async"')
    expect(on.counts).toMatchObject({ notes: 2, notesLeftOut: 0 })
  })

  it('positions only when asked, rounded', () => {
    expect(buildPayload(small, { includeNotes: false, includePositions: true }).payload.nodes[0]).toMatchObject({ x: 10, y: 21, w: 120, h: 60 })
  })

  it('a subset sends the chosen shapes and only connectors between them', () => {
    const { payload, counts } = buildPayload(small, { ids: ['a', 'b'], includeNotes: false })
    expect(payload.nodes.map((n) => n.id)).toEqual(['a', 'b'])
    expect(payload.edges.map((e) => e.id)).toEqual(['e1'])
    expect(counts).toMatchObject({ nodes: 2, edges: 1 })
  })

  it('a chosen group brings its nested groups and shapes', () => {
    const outer = pool.groups.find((g) => !g.parentId)!
    const { payload } = buildPayload(pool, { ids: [outer.id], includeNotes: false })
    const inside = pool.nodes.filter((n) => n.groupId !== undefined).map((n) => n.id)
    expect(payload.groups!.length).toBe(pool.groups.length)
    expect(payload.nodes.map((n) => n.id).sort()).toEqual(inside.sort())
    expect(payload.groups!.some((g) => g.parent === outer.id)).toBe(true)
  })

  it('an empty subset sends nothing but the title', () => {
    expect(buildPayload(web, { ids: [], includeNotes: true }).payload).toEqual({ title: web.meta.title, nodes: [], edges: [] })
  })

  it('leaves out hidden layers unless asked', () => {
    const shown = buildPayload(layered, { includeNotes: false })
    const all = buildPayload(layered, { includeNotes: false, includeHidden: true })
    expect(all.counts.nodes).toBeGreaterThan(shown.counts.nodes)
  })

  it('is deterministic', () => {
    expect(buildPayload(web, { includeNotes: true }).json).toBe(buildPayload(web, { includeNotes: true }).json)
  })
})

describe('size estimate', () => {
  it('counts characters (not bytes) and rounds tokens up', () => {
    expect(estimateSize('')).toEqual({ characters: 0, tokens: 0 })
    expect(estimateSize('abcd')).toEqual({ characters: 4, tokens: 2 })
    expect(estimateSize('héllo→')).toEqual({ characters: 6, tokens: 2 })
  })

  it('is deterministic and never shrinks as text grows', () => {
    let previous = estimateSize('')
    let text = ''
    for (let i = 0; i < 300; i++) {
      text += i % 7 === 0 ? '→' : String.fromCharCode(97 + (i % 26))
      const next = estimateSize(text)
      expect(next.characters).toBeGreaterThanOrEqual(previous.characters)
      expect(next.tokens).toBeGreaterThanOrEqual(previous.tokens)
      expect(estimateSize(text)).toEqual(next)
      previous = next
    }
  })

  it('a bigger payload estimates bigger', () => {
    const subset = estimateSize(buildPayload(web, { ids: [web.nodes[0]!.id], includeNotes: false }).json)
    const whole = estimateSize(buildPayload(web, { includeNotes: false }).json)
    const withNotes = estimateSize(buildPayload(web, { includeNotes: true }).json)
    expect(whole.tokens).toBeGreaterThan(subset.tokens)
    expect(withNotes.characters).toBeGreaterThanOrEqual(whole.characters)
  })

  it('says it is an estimate', () => {
    expect(describeSize({ characters: 1234, tokens: 412 })).toBe('1,234 characters, about 412 tokens (an estimate)')
  })
})

describe('models', () => {
  it('one config with a small and a large model, each with a display name', () => {
    expect(AI_MODELS.small).toMatchObject({ id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5' })
    expect(AI_MODELS.large).toMatchObject({ id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5' })
  })
})
