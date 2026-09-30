import { describe, expect, it } from 'vitest'
import { fixtures } from '@/fixtures'
import { DiagramSchema, parseDiagram, type Diagram } from '@/schema/diagram'
import { createNode } from '@/schema/factories'
import { addNode, connect, deleteElements, moveNodes, placeNode, resizeNode, setNodeLabel, setTitle, snap, touch } from './ops'

const base = () => parseDiagram(fixtures['all-shapes'])
const valid = (d: Diagram) => expect(DiagramSchema.safeParse(d).error?.issues ?? []).toEqual([])

describe('ops', () => {
  it('adds a node and ignores a duplicate id', () => {
    const node = createNode('cloud', { x: 1, y: 2 })
    const d = addNode(base(), node)
    expect(d.nodes.at(-1)).toBe(node)
    expect(addNode(d, node)).toBe(d)
    valid(d)
  })

  it('moves nodes, ignoring unknown ids and non-finite positions', () => {
    const d0 = base()
    const d = moveNodes(
      d0,
      new Map([
        ['n_rect', { x: 50, y: 60 }],
        ['n_round', { x: Number.NaN, y: 0 }],
        ['nope', { x: 1, y: 1 }],
      ]),
    )
    expect(d.nodes[0]!.position).toEqual({ x: 50, y: 60 })
    expect(d.nodes[1]).toBe(d0.nodes[1])
    expect(moveNodes(d0, new Map())).toBe(d0)
    expect(moveNodes(d0, new Map([['n_rect', { ...d0.nodes[0]!.position }]]))).toBe(d0)
    valid(d)
  })

  it('resizes with a minimum and optional new position', () => {
    const d = resizeNode(base(), 'n_rect', { width: 5, height: 300 }, { x: -10, y: -20 }, 24)
    expect(d.nodes[0]).toMatchObject({ size: { width: 24, height: 300 }, position: { x: -10, y: -20 } })
    expect(resizeNode(d, 'n_rect', { width: Number.NaN, height: 1 })).toBe(d)
    valid(d)
  })

  it('sets labels and titles, keeping identity when unchanged', () => {
    const d0 = base()
    const d = setNodeLabel(d0, 'n_db', 'Orders DB')
    expect(d.nodes.find((n) => n.id === 'n_db')!.label).toBe('Orders DB')
    expect(setNodeLabel(d, 'n_db', 'Orders DB')).toBe(d)
    expect(setTitle(d0, d0.meta.title)).toBe(d0)
    expect(setTitle(d0, 'New').meta.title).toBe('New')
  })

  it('connects nodes with handles', () => {
    const { diagram, edgeId } = connect(base(), { source: 'n_db', target: 'n_text', sourceHandle: 'bottom', targetHandle: null })
    const edge = diagram.edges.find((e) => e.id === edgeId)!
    expect(edge).toMatchObject({ source: 'n_db', target: 'n_text', sourceHandle: 'bottom' })
    expect(edge).not.toHaveProperty('targetHandle')
    valid(diagram)
  })

  it.each([
    ['a self-loop', { source: 'n_db', target: 'n_db' }],
    ['a missing node', { source: 'n_db', target: 'ghost' }],
    ['a duplicate', { source: 'n_rect', target: 'n_round', sourceHandle: 'right', targetHandle: 'left' }],
  ])('refuses %s', (_label, connection) => {
    const d = base()
    expect(connect(d, connection)).toEqual({ diagram: d, edgeId: null })
  })

  it('deletes nodes together with their edges', () => {
    const d = deleteElements(base(), ['n_round'])
    expect(d.nodes.map((n) => n.id)).not.toContain('n_round')
    expect(d.edges.map((e) => e.id)).toEqual(['e_3'])
    valid(d)
  })

  it('deletes edges alone and ignores unknown ids', () => {
    const d0 = base()
    expect(deleteElements(d0, ['e_2']).edges.map((e) => e.id)).toEqual(['e_1', 'e_3'])
    expect(deleteElements(d0, ['ghost'])).toBe(d0)
    expect(deleteElements(d0, [])).toBe(d0)
  })

  it('touch stamps the updated time', () => {
    const d = touch(base(), new Date('2027-01-02T03:04:05.000Z'))
    expect(d.meta.updated).toBe('2027-01-02T03:04:05.000Z')
    valid(d)
  })

  it('snaps to the grid', () => {
    expect(snap(29, 20)).toBe(20)
    expect(snap(31, 20)).toBe(40)
    expect(snap(-11, 20)).toBe(-20)
    expect(snap(7, 0)).toBe(7)
  })

  it('places nodes centred, snapped, and stepping away from occupied spots', () => {
    const empty: Diagram = { ...base(), nodes: [], edges: [] }
    const size = { width: 160, height: 80 }
    const first = placeNode(empty, { x: 100, y: 100 }, size)
    expect(first).toEqual({ x: 20, y: 60 })
    const withOne = addNode(empty, createNode('rectangle', first))
    expect(placeNode(withOne, { x: 100, y: 100 }, size)).toEqual({ x: 44, y: 84 })
    expect(placeNode(empty, { x: 105, y: 97 }, size, 20)).toEqual({ x: 20, y: 60 })
    const snapped = addNode(empty, createNode('rectangle', { x: 20, y: 60 }))
    expect(placeNode(snapped, { x: 100, y: 100 }, size, 20)).toEqual({ x: 40, y: 80 })
  })
})
