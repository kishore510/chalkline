import { describe, expect, it } from 'vitest'
import { fixtures } from '@/fixtures'
import { DiagramSchema, NODE_SHAPES, type Diagram } from './diagram'
import { createDiagram, createEdge, createNode, DEFAULT_NODE_LABEL, DEFAULT_NODE_SIZE } from './factories'

function clone<T>(value: T): T {
  return structuredClone(value)
}

const valid = fixtures['all-shapes'] as Diagram

function issuesOf(input: unknown): string[] {
  const result = DiagramSchema.safeParse(input)
  return result.success ? [] : result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
}

describe('fixtures', () => {
  it.each(Object.entries(fixtures))('%s validates against the current schema', (_name, fixture) => {
    expect(issuesOf(fixture)).toEqual([])
  })

  it('all-shapes covers every node shape', () => {
    const shapes = new Set(valid.nodes.map((n) => n.shape))
    expect([...shapes].sort()).toEqual([...NODE_SHAPES].sort())
  })
})

describe('DiagramSchema rejects bad documents', () => {
  it('rejects an edge pointing at a missing node', () => {
    const doc = clone(valid)
    doc.edges[0]!.target = 'nope'
    expect(issuesOf(doc)).toEqual(['edges.0.target: Edge target "nope" does not match any node'])
  })

  it('rejects duplicate ids, including across nodes and edges', () => {
    const doc = clone(valid)
    doc.nodes[1]!.id = doc.nodes[0]!.id
    doc.edges[0]!.id = doc.nodes[2]!.id
    const issues = issuesOf(doc)
    expect(issues.some((i) => i.startsWith('nodes.1.id: Duplicate id'))).toBe(true)
    expect(issues.some((i) => i.startsWith('edges.0.id: Duplicate id'))).toBe(true)
  })

  it('rejects an unknown shape', () => {
    const doc = clone(valid) as unknown as { nodes: { shape: string }[] }
    doc.nodes[0]!.shape = 'hexagon'
    expect(issuesOf(doc)).toHaveLength(1)
  })

  it('rejects unknown keys so schema changes cannot slip in without a migration', () => {
    expect(issuesOf({ ...clone(valid), colour: 'red' })).toHaveLength(1)
    const doc = clone(valid) as unknown as { nodes: Record<string, unknown>[] }
    doc.nodes[0]!.fill = 'red'
    expect(issuesOf(doc)).toHaveLength(1)
  })

  it('rejects sizes that are too small, and non-finite numbers', () => {
    const doc = clone(valid)
    doc.nodes[0]!.size.width = 1
    doc.nodes[1]!.position.x = Number.POSITIVE_INFINITY
    expect(issuesOf(doc)).toHaveLength(2)
  })

  it('rejects the wrong schemaVersion and bad timestamps', () => {
    expect(issuesOf({ ...clone(valid), schemaVersion: 2 })).toHaveLength(1)
    expect(issuesOf({ ...clone(valid), updatedAt: 'yesterday' })).toHaveLength(1)
  })

  it('rejects an out-of-range zoom', () => {
    expect(issuesOf({ ...clone(valid), viewport: { x: 0, y: 0, zoom: 0 } })).toHaveLength(1)
  })
})

describe('factories', () => {
  it('produce documents that pass validation', () => {
    const a = createNode('rectangle', { x: 0, y: 0 })
    const b = createNode('database', { x: 200, y: 0 })
    const diagram = createDiagram({ nodes: [a, b], edges: [createEdge(a.id, b.id)] })
    expect(issuesOf(diagram)).toEqual([])
  })

  it.each(NODE_SHAPES)('gives a %s node a default size and label', (shape) => {
    const node = createNode(shape, { x: 10, y: 20 })
    expect(node.size).toEqual(DEFAULT_NODE_SIZE[shape])
    expect(node.size).not.toBe(DEFAULT_NODE_SIZE[shape])
    expect(node.label).toBe(DEFAULT_NODE_LABEL[shape])
  })

  it('creates unique ids', () => {
    const ids = new Set(Array.from({ length: 500 }, () => createNode('text', { x: 0, y: 0 }).id))
    expect(ids.size).toBe(500)
  })
})
