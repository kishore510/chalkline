import { beforeEach, describe, expect, it } from 'vitest'
import { fixtures } from '@/fixtures'
import { DiagramSchema } from '@/schema/diagram'
import { useDiagramStore } from './diagramStore'

const store = () => useDiagramStore.getState()
const node = (id: string) => store().diagram.nodes.find((n) => n.id === id)!
const expectValid = () => expect(DiagramSchema.safeParse(store().diagram).error?.issues ?? []).toEqual([])

beforeEach(() => store().load(fixtures['all-shapes'], { undoable: false }))

describe('arrange actions', () => {
  it('aligns the selected nodes as one undo step, ignoring selected edges', () => {
    const before = store().diagram
    store().setSelection(['n_rect', 'n_round', 'n_db', 'e_1'])
    store().alignSelection('top')
    expect([node('n_rect'), node('n_round'), node('n_db')].map((n) => n.position.y)).toEqual([-10, -10, -10])
    expect(store().diagram.edges).toEqual(before.edges)
    expectValid()
    store().undo()
    expect(store().diagram).toBe(before)
    expect(store().canUndo).toBe(false)
  })

  it('distributes as one undo step, and needs three nodes', () => {
    store().setSelection(['n_rect', 'n_round'])
    const before = store().diagram
    store().distributeSelection('horizontal')
    expect(store().diagram).toBe(before)
    // Rectangle 0..160, text 400..560, database 440..560: gaps become 60 each.
    store().setSelection(['n_rect', 'n_text', 'n_db'])
    store().distributeSelection('horizontal')
    expect(node('n_text').position.x).toBe(220)
    expect(node('n_rect').position.x).toBe(0)
    expect(node('n_db').position.x).toBe(440)
    expectValid()
    store().undo()
    expect(store().diagram).toBe(before)
    expect(store().canUndo).toBe(false)
  })

  it('matches size as one undo step', () => {
    const before = store().diagram
    store().setSelection(['n_actor', 'n_cloud'])
    store().matchSizeSelection('both')
    expect(node('n_actor').size).toEqual(node('n_cloud').size)
    expectValid()
    store().undo()
    expect(store().diagram).toBe(before)
  })

  it('gives exact values, unaffected by snapping', () => {
    store().setSelection(['n_rect', 'n_db'])
    store().alignSelection('centre')
    const centre = (id: string) => node(id).position.x + node(id).size.width / 2
    expect(centre('n_rect')).toBe(centre('n_db'))
  })

  it('does nothing with fewer than two selected nodes', () => {
    const before = store().diagram
    store().setSelection(['n_rect', 'e_1'])
    store().alignSelection('left')
    store().matchSizeSelection('width')
    expect(store().diagram).toBe(before)
  })
})
