import { beforeEach, describe, expect, it } from 'vitest'
import { fixtures } from '@/fixtures'
import { DiagramSchema } from '@/schema/diagram'
import { useDiagramStore } from './diagramStore'

const store = () => useDiagramStore.getState()
const node = (id: string) => store().diagram.nodes.find((n) => n.id === id)!
const valid = () => expect(DiagramSchema.safeParse(store().diagram).error?.issues ?? []).toEqual([])

beforeEach(() => store().load(fixtures.container, { undoable: false }))

describe('changeNodeType', () => {
  it('changes the shape, keeping label, notes, style, size, connections and group, as one undo step', () => {
    store().setNodeNotes('n_orders', 'Handles orders')
    store().updateNodeStyles(['n_orders'], { fill: 'token:swatch-blue-soft' })
    const before = store().diagram
    const edges = before.edges
    const { label, notes, style, size, groupId } = node('n_orders')
    store().changeNodeType(['n_orders'], 'database')
    expect(node('n_orders')).toMatchObject({ type: 'database', label, notes, style, size, groupId })
    expect(store().diagram.edges).toEqual(edges)
    valid()
    store().undo()
    expect(store().diagram).toBe(before)
  })

  it('grows the size to the new shape’s minimum', () => {
    store().resizeNode('n_orders', { width: 24, height: 24 })
    store().changeNodeType(['n_orders'], 'actor')
    const { width, height } = node('n_orders').size
    expect(width).toBeGreaterThanOrEqual(24)
    expect(height).toBeGreaterThanOrEqual(24)
    valid()
  })

  it('refuses unknown shapes and skips locked nodes', () => {
    const before = store().diagram
    store().changeNodeType(['n_orders'], 'hologram')
    expect(store().diagram).toBe(before)
    store().setLocked(['n_orders'], true)
    const locked = store().diagram
    store().changeNodeType(['n_orders'], 'cloud')
    expect(store().diagram).toBe(locked)
  })

  it('can replace an unknown shape with a known one', () => {
    store().load(fixtures['unknown-shape'], { undoable: false })
    store().changeNodeType(['n_future'], 'rounded')
    expect(node('n_future')).toMatchObject({ type: 'rounded', label: 'From a newer version', notes: 'Kept exactly as saved' })
    valid()
  })
})
