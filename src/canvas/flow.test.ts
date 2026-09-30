import { MarkerType, type NodeChange } from '@xyflow/react'
import { describe, expect, it } from 'vitest'
import { fixtures } from '@/fixtures'
import { parseDiagram } from '@/schema/diagram'
import { setNodeLabel } from '@/store/ops'
import { applySelection, createNodeMapper, summariseEdgeChanges, summariseNodeChanges, toFlowEdge, toFlowEdges } from './flow'

const diagram = () => parseDiagram(fixtures['all-shapes'])

describe('createNodeMapper', () => {
  it('maps every node with size, measured size and data', () => {
    const nodes = createNodeMapper()(diagram(), new Set(['n_db']))
    expect(nodes).toHaveLength(6)
    expect(nodes.find((n) => n.id === 'n_db')).toMatchObject({
      type: 'shape',
      width: 120,
      height: 100,
      measured: { width: 120, height: 100 },
      selected: true,
      data: { type: 'database', label: 'Database', style: {}, hasNotes: false },
    })
  })

  it('reuses unchanged nodes and rebuilds changed ones', () => {
    const map = createNodeMapper()
    const d = diagram()
    const first = map(d, new Set())
    const changed = setNodeLabel(d, 'n_rect', 'New')
    const second = map(changed, new Set(['n_db']))
    expect(second[0]).not.toBe(first[0])
    expect(second[1]).toBe(first[1])
    expect(second.find((n) => n.id === 'n_db')).not.toBe(first.find((n) => n.id === 'n_db'))
    expect(map(changed, new Set(['n_db']), false)[1]).not.toBe(second[1])
  })
})

describe('edges', () => {
  it('draws pinned edges with the floating edge, passing the sides as data', () => {
    const [edge] = toFlowEdges(diagram(), new Set())
    expect(edge).toMatchObject({ type: 'floating', sourceHandle: null, targetHandle: null, markerStart: undefined })
    expect(edge!.data).toEqual({ lineType: 'smoothstep', sourceSide: 'right', targetSide: 'left' })
    expect(edge!.markerEnd).toMatchObject({ type: MarkerType.Arrow, color: 'var(--cl-edge)' })
  })

  it('floats edges without handles, keeping any single pinned side', () => {
    const floating = toFlowEdge({ id: 'e', source: 'a', target: 'b', label: '', notes: '', style: {} }, false)
    expect(floating).toMatchObject({ type: 'floating', sourceHandle: null, targetHandle: null, data: { lineType: 'smoothstep' } })
    const half = toFlowEdge({ id: 'e', source: 'a', target: 'b', sourceHandle: 'bottom', label: '', notes: '', style: { lineType: 'step' } }, false)
    expect(half.data).toEqual({ lineType: 'step', sourceSide: 'bottom' })
    const junk = toFlowEdge({ id: 'e', source: 'a', target: 'b', sourceHandle: 'weird', targetHandle: 'left', label: '', notes: '', style: {} }, false)
    expect(junk.data).toEqual({ lineType: 'smoothstep', targetSide: 'left' })
  })

  it('maps arrowheads and selection colour', () => {
    const edge = toFlowEdge(
      { id: 'e', source: 'a', target: 'b', label: '', notes: '', style: { lineType: 'bezier', startArrow: 'closed', endArrow: 'none' } },
      true,
    )
    expect(edge.markerStart).toMatchObject({ type: MarkerType.ArrowClosed, color: 'var(--cl-accent)' })
    expect(edge.markerEnd).toBeUndefined()
    expect(edge.sourceHandle).toBeNull()
  })
})

describe('edge appearance', () => {
  it('applies colour, width, dash and label', () => {
    const edge = toFlowEdge(
      { id: 'e', source: 'a', target: 'b', label: 'SQL', notes: '', style: { colour: 'token:swatch-red', width: 2, dashed: true } },
      false,
    )
    expect(edge.style).toEqual({ stroke: 'var(--cl-swatch-red, var(--cl-edge))', strokeWidth: 2, strokeDasharray: '8 6' })
    expect(edge.markerEnd).toMatchObject({ color: 'var(--cl-swatch-red, var(--cl-edge))' })
    expect(edge.label).toBe('SQL')
  })

  it('uses the accent and a heavier line when selected, and hides blank labels', () => {
    const edge = toFlowEdge({ id: 'e', source: 'a', target: 'b', label: '  ', notes: '', style: { colour: '#123456' } }, true, 2)
    expect(edge.style).toMatchObject({ stroke: 'var(--cl-accent)', strokeWidth: 3, strokeDasharray: undefined })
    expect(edge.label).toBeUndefined()
  })
})

describe('summariseNodeChanges', () => {
  it('collects moves, removals and selection', () => {
    const changes: NodeChange[] = [
      { type: 'position', id: 'a', position: { x: 1, y: 2 }, dragging: true },
      { type: 'position', id: 'b', dragging: false },
      { type: 'remove', id: 'c' },
      { type: 'select', id: 'd', selected: true },
    ]
    const s = summariseNodeChanges(changes)
    expect([...s.moves]).toEqual([['a', { x: 1, y: 2 }]])
    expect(s.removed).toEqual(['c'])
    expect([...s.selection]).toEqual([['d', true]])
  })

  it('ignores plain measurements but keeps resizer changes with their position', () => {
    const s = summariseNodeChanges([
      { type: 'dimensions', id: 'a', dimensions: { width: 10, height: 10 } },
      { type: 'dimensions', id: 'b', dimensions: { width: 200, height: 90 }, resizing: true, setAttributes: true },
      { type: 'position', id: 'b', position: { x: -5, y: -6 } },
    ])
    expect(s.resizes).toEqual([{ id: 'b', size: { width: 200, height: 90 }, position: { x: -5, y: -6 } }])
    expect(s.moves.size).toBe(0)
  })

  it('summarises edge changes', () => {
    expect(
      summariseEdgeChanges([
        { type: 'remove', id: 'e1' },
        { type: 'select', id: 'e2', selected: true },
      ]),
    ).toEqual({ removed: ['e1'], selection: new Map([['e2', true]]) })
  })
})

describe('applySelection', () => {
  it('adds and removes ids keeping order', () => {
    expect(applySelection(['a', 'b'], new Map([['a', false], ['c', true], ['b', true]]))).toEqual(['b', 'c'])
    const same = ['a']
    expect(applySelection(same, new Map())).toBe(same)
  })
})
