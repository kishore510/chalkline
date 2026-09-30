import { beforeEach, describe, expect, it } from 'vitest'
import { floatingEndpoints } from '@/canvas/floating'
import { toFlowEdge } from '@/canvas/flow'
import { fixtures } from '@/fixtures'
import { DiagramSchema } from '@/schema/diagram'
import { useDiagramStore } from './diagramStore'

const store = () => useDiagramStore.getState()
const edge = (id: string) => store().diagram.edges.find((e) => e.id === id)!
const node = (id: string) => store().diagram.nodes.find((n) => n.id === id)!
const expectValid = () => expect(DiagramSchema.safeParse(store().diagram).error?.issues ?? []).toEqual([])

let floating: string

beforeEach(() => {
  store().load(fixtures['all-shapes'])
  floating = store().linkNodes('n_db', 'n_text')!
})

describe('edge sides', () => {
  it('pins one side and leaves the other on auto', () => {
    store().setEdgeSides([floating], { source: 'bottom' })
    expect(edge(floating).sourceHandle).toBe('bottom')
    expect(edge(floating)).not.toHaveProperty('targetHandle')
    expectValid()
  })

  it('pins both sides, which switches rendering to a fixed edge', () => {
    store().setEdgeSides([floating], { source: 'left', target: 'top' })
    expect(edge(floating)).toMatchObject({ sourceHandle: 'left', targetHandle: 'top' })
    expect(toFlowEdge(edge(floating), false)).toMatchObject({ sourceHandle: 'left', targetHandle: 'top' })
    expect(toFlowEdge(edge(floating), false).type).not.toBe('floating')
  })

  it('unpins a side back to auto by removing the handle', () => {
    store().setEdgeSides(['e_1'], { source: null })
    expect(edge('e_1')).not.toHaveProperty('sourceHandle')
    expect(edge('e_1').targetHandle).toBe('left')
    expectValid()
  })

  it('reset to auto removes both handles', () => {
    store().resetEdgeSides(['e_1', floating])
    expect(edge('e_1')).not.toHaveProperty('sourceHandle')
    expect(edge('e_1')).not.toHaveProperty('targetHandle')
    expect(toFlowEdge(edge('e_1'), false).type).toBe('floating')
    expectValid()
  })

  it('keeps pinned sides when nodes move, while auto sides re-route', () => {
    store().setEdgeSides([floating], { source: 'top' })
    // Move the target far to the right of the source.
    store().moveNodes(new Map([['n_text', { x: 2000, y: node('n_db').position.y }]]))
    expect(edge(floating).sourceHandle).toBe('top')
    const box = (id: string) => ({ ...node(id).position, ...node(id).size })
    const ends = floatingEndpoints(box('n_db'), box('n_text'), 'top')
    expect(ends.sourceSide).toBe('top')
    expect(ends.targetSide).toBe('left')
  })

  it('ignores unknown sides and leaves unchanged edges alone', () => {
    const before = store().diagram
    store().setEdgeSides([floating], { source: 'middle' as never })
    expect(store().diagram).toBe(before)
    store().setEdgeSides(['e_1'], { source: 'right', target: 'left' })
    expect(store().diagram).toBe(before)
    store().resetEdgeSides([floating])
    expect(store().diagram).toBe(before)
  })
})
