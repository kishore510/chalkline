import { describe, expect, it } from 'vitest'
import { DEFAULT_NODE_SIZE } from '@/schema/factories'
import { NODE_TYPES, type Size } from '@/schema/diagram'
import { shapeGeometry } from './geometry'

// Pull every number out of a path. Arc commands carry radii and flags as well
// as the end point, which is fine here: all of them must be finite and
// non-negative, and none may exceed the box size.
function numbers(path: string): number[] {
  return [...path.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]))
}

const SIZES: Size[] = [
  ...Object.values(DEFAULT_NODE_SIZE),
  { width: 1, height: 1 },
  { width: 600, height: 40 },
  { width: 40, height: 600 },
]

describe.each(NODE_TYPES)('%s geometry', (shape) => {
  it.each(SIZES)('stays inside a $width x $height box', (size) => {
    const geometry = shapeGeometry(shape, size)
    const limit = Math.max(size.width, size.height)
    for (const path of [...geometry.body, ...geometry.detail]) {
      for (const value of numbers(path)) {
        expect(Number.isFinite(value)).toBe(true)
        expect(value).toBeGreaterThanOrEqual(0)
        expect(value).toBeLessThanOrEqual(limit + 0.01)
      }
    }
    const { label } = geometry
    expect(label.x).toBeGreaterThanOrEqual(0)
    expect(label.y).toBeGreaterThanOrEqual(0)
    expect(label.width).toBeGreaterThanOrEqual(0)
    expect(label.height).toBeGreaterThanOrEqual(0)
    expect(label.x + label.width).toBeLessThanOrEqual(size.width + 0.01)
    expect(label.y + label.height).toBeLessThanOrEqual(size.height + 0.01)
  })

  it('has an outline unless it is plain text', () => {
    const geometry = shapeGeometry(shape, DEFAULT_NODE_SIZE[shape])
    expect(geometry.body.length > 0).toBe(shape !== 'text')
  })
})

describe('cloud geometry', () => {
  it('keeps x within width and y within height', () => {
    const size = { width: 300, height: 100 }
    const [d] = shapeGeometry('cloud', size).body
    const values = numbers(d!)
    const xs = values.filter((_, i) => i % 2 === 0)
    const ys = values.filter((_, i) => i % 2 === 1)
    expect(Math.max(...xs)).toBeLessThanOrEqual(300)
    expect(Math.max(...ys)).toBeLessThanOrEqual(100)
  })
})
