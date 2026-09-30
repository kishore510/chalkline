import { beforeEach, describe, expect, it } from 'vitest'
import { fixtures } from '@/fixtures'
import { DiagramSchema } from '@/schema/diagram'
import { useDiagramStore } from './diagramStore'

const store = () => useDiagramStore.getState()
const node = (id: string) => store().diagram.nodes.find((n) => n.id === id)!
const valid = () => expect(DiagramSchema.safeParse(store().diagram).error?.issues ?? []).toEqual([])

describe('applyLayout', () => {
  beforeEach(() => store().load(fixtures.container, { undoable: false }))

  it('applies positions and group boxes as one undo step', () => {
    const before = store().diagram
    const changed = store().applyLayout({
      nodes: new Map([
        ['n_orders', { x: 40, y: 100 }],
        ['n_payments', { x: 240, y: 100 }],
        ['n_store', { x: 440, y: 90 }],
        ['n_client', { x: -300, y: 100 }],
      ]),
      groups: new Map([['g_backend', { x: 20, y: 44, width: 580, height: 180 }]]),
      groupMoves: new Map(),
    })
    expect(changed).toBe(true)
    expect(node('n_orders').position).toEqual({ x: 40, y: 100 })
    expect(store().diagram.groups[0]).toMatchObject({ position: { x: 20, y: 44 }, size: { width: 580, height: 180 } })
    valid()
    expect(store().past).toHaveLength(1)
    store().undo()
    expect(store().diagram).toBe(before)
  })

  it('moves collapsed groups with their contents', () => {
    store().setCollapsed('g_backend', true)
    store().applyLayout({ nodes: new Map(), groups: new Map(), groupMoves: new Map([['g_backend', { x: 100, y: 100 }]]) })
    expect(node('n_orders').position).toEqual({ x: 124, y: 180 })
    valid()
  })

  it('never moves locked items even if asked', () => {
    store().setLocked(['n_client'], true)
    store().applyLayout({ nodes: new Map([['n_client', { x: 999, y: 999 }]]), groups: new Map(), groupMoves: new Map() })
    expect(node('n_client').position).toEqual({ x: -200, y: 60 })
  })
})

describe('tidyConnectors', () => {
  beforeEach(() => store().load(fixtures['web-architecture'], { undoable: false }))

  it('leaves pinned ends alone by default (auto ends already route to the nearest clear sides)', () => {
    const before = store().diagram
    expect(store().tidyConnectors({ clearPinned: false })).toEqual({ cleared: 0, skipped: 0 })
    expect(store().diagram).toBe(before)
  })

  it('"Also clear pinned sides" returns pinned ends to auto, as one undo step', () => {
    const before = store().diagram
    const pinned = before.edges.filter((e) => e.sourceHandle || e.targetHandle).length
    expect(store().tidyConnectors({ clearPinned: true })).toEqual({ cleared: pinned, skipped: 0 })
    expect(store().diagram.edges.every((e) => e.sourceHandle === undefined && e.targetHandle === undefined)).toBe(true)
    valid()
    store().undo()
    expect(store().diagram).toBe(before)
  })

  it('works on the selection only when there is one', () => {
    store().setSelection(['e_web_api'])
    expect(store().tidyConnectors({ clearPinned: true })).toEqual({ cleared: 1, skipped: 0 })
    expect(store().diagram.edges.find((e) => e.id === 'e_api_db')!.sourceHandle).toBe('bottom')
  })
})
