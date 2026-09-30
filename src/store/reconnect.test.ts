import { beforeEach, describe, expect, it } from 'vitest'
import { floatingEndpoints } from '@/canvas/floating'
import { fixtures } from '@/fixtures'
import { DiagramSchema } from '@/schema/diagram'
import { useDiagramStore } from './diagramStore'

const store = () => useDiagramStore.getState()
const edge = (id: string) => store().diagram.edges.find((e) => e.id === id)!
const node = (id: string) => store().diagram.nodes.find((n) => n.id === id)!
const box = (id: string) => ({ ...node(id).position, ...node(id).size })
const expectValid = () => expect(DiagramSchema.safeParse(store().diagram).error?.issues ?? []).toEqual([])

let id: string

beforeEach(() => {
  store().load(fixtures['all-shapes'])
  id = store().linkNodes('n_db', 'n_text')!
})

describe('reconnectEdge', () => {
  it('pins an end on the same node', () => {
    expect(store().reconnectEdge(id, { source: 'n_db', target: 'n_text', sourceHandle: 'top', targetHandle: null })).toBe(true)
    expect(edge(id)).toMatchObject({ source: 'n_db', target: 'n_text', sourceHandle: 'top' })
    expect(edge(id)).not.toHaveProperty('targetHandle')
    expectValid()
  })

  it('unpins an end back to auto', () => {
    store().reconnectEdge(id, { source: 'n_db', target: 'n_text', sourceHandle: 'top', targetHandle: 'left' })
    expect(store().reconnectEdge(id, { source: 'n_db', target: 'n_text', sourceHandle: null, targetHandle: 'left' })).toBe(true)
    expect(edge(id)).not.toHaveProperty('sourceHandle')
    expect(edge(id).targetHandle).toBe('left')
    expectValid()
  })

  it('moves an end to a different node and pins it there', () => {
    expect(store().reconnectEdge(id, { source: 'n_db', target: 'n_cloud', sourceHandle: null, targetHandle: 'right' })).toBe(true)
    expect(edge(id)).toMatchObject({ source: 'n_db', target: 'n_cloud', targetHandle: 'right' })
    expect(edge(id).label).toBe('')
    expectValid()
  })

  it.each([
    ['a self-loop', { source: 'n_db', target: 'n_db', sourceHandle: 'top', targetHandle: 'bottom' }],
    ['a missing node', { source: 'n_db', target: 'ghost', sourceHandle: null, targetHandle: null }],
    ['an unknown side', { source: 'n_db', target: 'n_text', sourceHandle: 'middle', targetHandle: null }],
    ['an exact duplicate of another edge', { source: 'n_rect', target: 'n_round', sourceHandle: 'right', targetHandle: 'left' }],
  ] as const)('rejects %s and leaves everything unchanged', (_label, change) => {
    const before = store().diagram
    expect(store().reconnectEdge(id, change as never)).toBe(false)
    expect(store().diagram).toBe(before)
  })

  it('rejects an unknown edge', () => {
    const before = store().diagram
    expect(store().reconnectEdge('ghost', { source: 'n_db', target: 'n_text', sourceHandle: null, targetHandle: null })).toBe(false)
    expect(store().diagram).toBe(before)
  })

  it('reports success without changing anything when nothing differs', () => {
    const before = store().diagram
    expect(store().reconnectEdge(id, { source: 'n_db', target: 'n_text', sourceHandle: null, targetHandle: null })).toBe(true)
    expect(store().diagram).toBe(before)
  })

  it('keeps pinned sides when nodes move while auto sides re-route', () => {
    store().reconnectEdge(id, { source: 'n_db', target: 'n_text', sourceHandle: 'bottom', targetHandle: null })
    const rightOf = { x: node('n_db').position.x + 1000, y: node('n_db').position.y }
    store().moveNodes(new Map([['n_text', rightOf]]))
    expect(edge(id).sourceHandle).toBe('bottom')
    expect(edge(id)).not.toHaveProperty('targetHandle')
    const ends = floatingEndpoints(box('n_db'), box('n_text'), 'bottom', undefined)
    expect(ends.sourceSide).toBe('bottom')
    expect(ends.targetSide).toBe('left')
    const below = { x: node('n_db').position.x, y: node('n_db').position.y + 1000 }
    store().moveNodes(new Map([['n_text', below]]))
    expect(floatingEndpoints(box('n_db'), box('n_text'), 'bottom', undefined).targetSide).toBe('top')
  })
})
