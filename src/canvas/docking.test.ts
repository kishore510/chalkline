import { describe, expect, it } from 'vitest'
import { findDockingTarget } from './docking'

const nodes = [
  { id: 'a', position: { x: 0, y: 0 }, size: { width: 100, height: 60 } },
  { id: 'b', position: { x: 300, y: 0 }, size: { width: 100, height: 60 } },
]

describe('findDockingTarget', () => {
  it('snaps to the nearest side when the pointer is inside a node', () => {
    expect(findDockingTarget({ x: 390, y: 30 }, nodes, 40, 'a')).toMatchObject({ nodeId: 'b', side: 'right', x: 400, y: 30 })
    expect(findDockingTarget({ x: 350, y: 5 }, nodes, 40, 'a')).toMatchObject({ nodeId: 'b', side: 'top' })
  })

  it('snaps within the radius just outside a node', () => {
    expect(findDockingTarget({ x: 285, y: 32 }, nodes, 40, 'a')).toMatchObject({ nodeId: 'b', side: 'left' })
  })

  it('returns null on empty canvas beyond the radius', () => {
    expect(findDockingTarget({ x: 200, y: 300 }, nodes, 40, 'a')).toBeNull()
  })

  it('never targets the node at the other end (no self-loops)', () => {
    expect(findDockingTarget({ x: 50, y: 30 }, nodes, 40, 'a')).toBeNull()
  })

  it('prefers the topmost (last) node where nodes overlap', () => {
    const stacked = [...nodes, { id: 'c', position: { x: 320, y: 10 }, size: { width: 40, height: 40 } }]
    expect(findDockingTarget({ x: 340, y: 30 }, stacked, 40, 'a')?.nodeId).toBe('c')
  })
})
