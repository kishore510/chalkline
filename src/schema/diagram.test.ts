import { describe, expect, it } from 'vitest'
import { fixtures } from '@/fixtures'
import {
  createEmptyDiagram,
  DiagramSchema,
  NODE_TYPES,
  parseDiagram,
  safeParseDiagram,
  type Diagram,
  type DiagramInput,
} from './diagram'
import { createEdge, createNode, DEFAULT_NODE_LABEL, DEFAULT_NODE_SIZE } from './factories'

const valid = fixtures['all-shapes'] as DiagramInput
const clone = () => structuredClone(valid) as Diagram

function issuesOf(input: unknown): string[] {
  const result = DiagramSchema.safeParse(input)
  return result.success ? [] : result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
}

describe('fixtures', () => {
  it.each(Object.entries(fixtures))('%s validates against the current schema', (_name, fixture) => {
    expect(issuesOf(fixture)).toEqual([])
  })

  it('all-shapes covers every node type', () => {
    expect([...new Set(valid.nodes.map((n) => n.type))].sort()).toEqual([...NODE_TYPES].sort())
  })

  it('fills in defaults for omitted fields', () => {
    const diagram = parseDiagram(valid)
    expect(diagram.groups).toEqual([])
    expect(diagram.nodes[0]).toMatchObject({ notes: '', style: {} })
    expect(diagram.edges[0]).toMatchObject({ label: '', notes: '', style: {} })
  })
})

describe('DiagramSchema rejects bad documents', () => {
  it('rejects an edge pointing at a missing node', () => {
    const doc = clone()
    doc.edges[0]!.target = 'nope'
    expect(issuesOf(doc)).toEqual(['edges.0.target: Edge target "nope" does not exist'])
  })

  it('rejects duplicate node and edge ids', () => {
    const doc = clone()
    doc.nodes[1]!.id = doc.nodes[0]!.id
    doc.edges[1]!.id = doc.edges[0]!.id
    const issues = issuesOf(doc)
    expect(issues).toContain(`nodes.1.id: Duplicate node id "${doc.nodes[0]!.id}"`)
    expect(issues).toContain(`edges.1.id: Duplicate edge id "${doc.edges[0]!.id}"`)
  })

  it('rejects a node in an unknown group', () => {
    const doc = clone()
    doc.nodes[0]!.groupId = 'g_missing'
    expect(issuesOf(doc)).toEqual(['nodes.0.groupId: Unknown group "g_missing"'])
  })

  it('rejects an unknown node type', () => {
    const doc = clone() as unknown as { nodes: { type: string }[] }
    doc.nodes[0]!.type = 'hexagon'
    expect(issuesOf(doc)).toHaveLength(1)
  })

  it.each(['red', '#fff', '#12345678', 'token:Accent', 'token:'])('rejects the colour %s', (colour) => {
    const doc = clone()
    doc.nodes[0]!.style = { fill: colour }
    expect(issuesOf(doc)).toHaveLength(1)
  })

  it.each(['#1F6AA5', '#1f6aa5', 'token:accent', 'token:node-fill'])('accepts the colour %s', (colour) => {
    const doc = clone()
    doc.nodes[0]!.style = { fill: colour, stroke: colour, textColour: colour }
    expect(issuesOf(doc)).toEqual([])
  })

  it('rejects out-of-range style numbers', () => {
    const doc = clone()
    doc.nodes[0]!.style = { strokeWidth: 13, fontSize: 4 }
    doc.edges[0]!.style = { width: 0 }
    expect(issuesOf(doc)).toHaveLength(3)
  })

  it('rejects non-positive sizes and non-finite positions', () => {
    const doc = clone()
    doc.nodes[0]!.size.width = 0
    doc.nodes[1]!.position.x = Number.POSITIVE_INFINITY
    expect(issuesOf(doc)).toHaveLength(2)
  })

  it('rejects the wrong schemaVersion and bad timestamps', () => {
    expect(issuesOf({ ...clone(), schemaVersion: 2 })).toHaveLength(1)
    expect(issuesOf({ ...clone(), meta: { ...clone().meta, updated: 'yesterday' } })).toHaveLength(1)
  })
})

describe('factories', () => {
  it('produce documents that pass validation', () => {
    const a = createNode('rectangle', { x: 0, y: 0 })
    const b = createNode('database', { x: 200, y: 0 })
    const diagram = { ...createEmptyDiagram(), nodes: [a, b], edges: [createEdge(a.id, b.id)] }
    expect(issuesOf(diagram)).toEqual([])
    expect(DiagramSchema.parse(diagram)).toEqual(diagram)
  })

  it('creates a valid empty diagram', () => {
    const diagram = createEmptyDiagram('Mine')
    expect(issuesOf(diagram)).toEqual([])
    expect(diagram.meta.title).toBe('Mine')
  })

  it.each(NODE_TYPES)('gives a %s node a default size and label', (type) => {
    const node = createNode(type, { x: 10, y: 20 })
    expect(node.size).toEqual(DEFAULT_NODE_SIZE[type])
    expect(node.size).not.toBe(DEFAULT_NODE_SIZE[type])
    expect(node.label).toBe(DEFAULT_NODE_LABEL[type])
  })

  it('creates unique ids', () => {
    const ids = new Set(Array.from({ length: 500 }, () => createNode('text', { x: 0, y: 0 }).id))
    expect(ids.size).toBe(500)
  })
})

describe('safeParseDiagram', () => {
  it('returns data for a valid document', () => {
    const result = safeParseDiagram(valid)
    expect(result.success).toBe(true)
  })

  it('returns an error instead of throwing', () => {
    expect(safeParseDiagram({ ...clone(), schemaVersion: 99 }).success).toBe(false)
    expect(safeParseDiagram({ nodes: [] }).success).toBe(false)
    expect(safeParseDiagram(null).success).toBe(false)
    expect(safeParseDiagram('nope').success).toBe(false)
  })
})
