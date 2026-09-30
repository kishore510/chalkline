import { describe, expect, it } from 'vitest'
import { align, ALIGN_MODES, distribute, matchSize, type Arrangeable } from './arrange'

const n = (id: string, x: number, y: number, width: number, height: number): Arrangeable => ({ id, position: { x, y }, size: { width, height } })

// Bounding box: x 0..300, y 0..200
const nodes = [n('a', 0, 50, 100, 50), n('b', 150, 0, 50, 100), n('c', 220, 120, 80, 80)]

describe('align', () => {
  it.each([
    ['left', { a: { x: 0, y: 50 }, b: { x: 0, y: 0 }, c: { x: 0, y: 120 } }],
    ['centre', { a: { x: 100, y: 50 }, b: { x: 125, y: 0 }, c: { x: 110, y: 120 } }],
    ['right', { a: { x: 200, y: 50 }, b: { x: 250, y: 0 }, c: { x: 220, y: 120 } }],
    ['top', { a: { x: 0, y: 0 }, b: { x: 150, y: 0 }, c: { x: 220, y: 0 } }],
    ['middle', { a: { x: 0, y: 75 }, b: { x: 150, y: 50 }, c: { x: 220, y: 60 } }],
    ['bottom', { a: { x: 0, y: 150 }, b: { x: 150, y: 100 }, c: { x: 220, y: 120 } }],
  ] as const)('%s', (mode, expected) => {
    expect(Object.fromEntries(align(nodes, mode))).toEqual(expected)
  })

  it('covers every mode', () => {
    expect([...ALIGN_MODES].sort()).toEqual(['bottom', 'centre', 'left', 'middle', 'right', 'top'])
  })

  it('needs at least two nodes', () => {
    expect(align([nodes[0]!], 'left').size).toBe(0)
  })
})

describe('distribute', () => {
  it('spaces gaps evenly using sizes, keeping the outermost nodes fixed', () => {
    // Widths 100, 20, 60; span 0..400 -> gaps (400 - 180) / 2 = 110.
    const row = [n('a', 0, 0, 100, 40), n('c', 340, 10, 60, 40), n('b', 120, 5, 20, 40)]
    const moves = distribute(row, 'horizontal')
    expect(moves.get('a')).toEqual({ x: 0, y: 0 })
    expect(moves.get('b')).toEqual({ x: 210, y: 5 })
    expect(moves.get('c')).toEqual({ x: 340, y: 10 })
  })

  it('works vertically with unequal heights', () => {
    const column = [n('a', 0, 0, 40, 100), n('b', 0, 150, 40, 10), n('c', 0, 170, 40, 30), n('d', 0, 400, 40, 100)]
    // Span 0..500, sizes 240, three gaps of (500 - 240) / 3.
    const gap = (500 - 240) / 3
    const moves = distribute(column, 'vertical')
    expect(moves.get('b')!.y).toBeCloseTo(100 + gap)
    expect(moves.get('c')!.y).toBeCloseTo(100 + gap + 10 + gap)
    expect(moves.get('d')).toEqual({ x: 0, y: 400 })
  })

  it('needs three or more nodes', () => {
    expect(distribute(nodes.slice(0, 2), 'horizontal').size).toBe(0)
  })

  it('orders by centre, so a wide node spanning others stays sensible', () => {
    const row = [n('a', 0, 0, 50, 10), n('b', 100, 0, 50, 10), n('c', 300, 0, 50, 10)]
    const moves = distribute(row, 'horizontal')
    expect(moves.get('b')!.x).toBe(150)
  })
})

describe('matchSize', () => {
  it('matches the largest width, height, or both, keeping top-left corners', () => {
    expect(Object.fromEntries(matchSize(nodes, 'width'))).toEqual({
      a: { width: 100, height: 50 },
      b: { width: 100, height: 100 },
      c: { width: 100, height: 80 },
    })
    expect(Object.fromEntries(matchSize(nodes, 'height'))).toEqual({
      a: { width: 100, height: 100 },
      b: { width: 50, height: 100 },
      c: { width: 80, height: 100 },
    })
    expect(Object.fromEntries(matchSize(nodes, 'both'))).toEqual({
      a: { width: 100, height: 100 },
      b: { width: 100, height: 100 },
      c: { width: 100, height: 100 },
    })
  })

  it('needs at least two nodes', () => {
    expect(matchSize([nodes[0]!], 'both').size).toBe(0)
  })
})
