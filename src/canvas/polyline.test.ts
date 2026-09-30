import { describe, expect, it } from 'vitest'
import { polylineMidpoint, polylinePath } from './polyline'

const pts = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 100 },
]

describe('polyline', () => {
  it('draws sharp or rounded corners', () => {
    expect(polylinePath(pts)).toBe('M0 0L100 0L100 100')
    expect(polylinePath(pts, 10)).toBe('M0 0L90 0Q100 0 100 10L100 100')
  })

  it('finds the midpoint by length', () => {
    expect(polylineMidpoint(pts)).toEqual({ x: 100, y: 0 })
    expect(polylineMidpoint([{ x: 0, y: 0 }, { x: 10, y: 0 }])).toEqual({ x: 5, y: 0 })
  })
})
