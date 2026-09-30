import { describe, expect, it } from 'vitest'
import { DEFAULT_NODE_SIZE } from '@/schema/factories'
import { NODE_TYPES, type Size } from '@/schema/diagram'
import { ACTOR_FIGURE_RATIO, labelLayout, minHeightForLabel, shapeGeometry } from './geometry'

// Pull every number out of a path. Arc commands carry radii and flags as well
// as the end point, which is fine here: all of them must be finite and
// non-negative, and none may exceed the box size.
function numbers(path: string): number[] {
  return [...path.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]))
}

const SIZES: Size[] = [...Object.values(DEFAULT_NODE_SIZE), { width: 1, height: 1 }, { width: 600, height: 40 }, { width: 40, height: 600 }]

describe.each(NODE_TYPES)('%s geometry', (shape) => {
  it.each(SIZES)('outline stays inside a $width x $height box', (size) => {
    const geometry = shapeGeometry(shape, size)
    const limit = Math.max(size.width, size.height)
    for (const path of [...geometry.body, ...geometry.detail]) {
      for (const value of numbers(path)) {
        expect(Number.isFinite(value)).toBe(true)
        expect(value).toBeGreaterThanOrEqual(0)
        expect(value).toBeLessThanOrEqual(limit + 0.01)
      }
    }
  })

  it.each(SIZES)('label zone sits inside a $width x $height box', (size) => {
    const { box } = labelLayout(shape, size)
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.y).toBeGreaterThanOrEqual(0)
    expect(box.width).toBeGreaterThanOrEqual(0)
    expect(box.height).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(size.width + 0.01)
    expect(box.y + box.height).toBeLessThanOrEqual(size.height + 0.01)
  })

  it.each(SIZES)('reports an extent inside a $width x $height box', (size) => {
    const { extent } = shapeGeometry(shape, size)
    expect(extent.x).toBeGreaterThanOrEqual(0)
    expect(extent.y + extent.height).toBeLessThanOrEqual(size.height + 0.01)
    expect(extent.x + extent.width).toBeLessThanOrEqual(size.width + 0.01)
  })

  it('has an outline unless it is plain text', () => {
    expect(shapeGeometry(shape, DEFAULT_NODE_SIZE[shape]).body.length > 0).toBe(shape !== 'text')
  })

  it('grows height monotonically to fit taller labels, never below the minimum', () => {
    const { width } = DEFAULT_NODE_SIZE[shape]
    const small = minHeightForLabel(shape, width, 20)
    const large = minHeightForLabel(shape, width, 120)
    expect(large).toBeGreaterThan(small)
    expect(labelLayout(shape, { width, height: large }).box.height).toBeGreaterThanOrEqual(120 - 0.5)
  })
})

describe('actor', () => {
  it('draws the figure in the top part and keeps the label zone below it', () => {
    for (const size of [DEFAULT_NODE_SIZE.actor, { width: 200, height: 300 }, { width: 40, height: 80 }]) {
      const { extent } = shapeGeometry('actor', size)
      const { box, fit } = labelLayout('actor', size)
      expect(extent.y + extent.height).toBeLessThanOrEqual(box.y + 0.01)
      expect(box.y).toBeCloseTo(size.height * ACTOR_FIGURE_RATIO, 1)
      expect(fit).toBe('free')
    }
  })

  it('is big enough by default for its figure and a two-line label', () => {
    expect(DEFAULT_NODE_SIZE.actor.width).toBeGreaterThanOrEqual(88)
    expect(labelLayout('actor', DEFAULT_NODE_SIZE.actor).box.height).toBeGreaterThanOrEqual(40)
  })
})

describe('labelLayout', () => {
  it('lets actor and text labels spread wider; others stay inside the shape', () => {
    expect(labelLayout('text', DEFAULT_NODE_SIZE.text).fit).toBe('free')
    for (const type of ['rectangle', 'rounded', 'database', 'cloud'] as const) {
      expect(labelLayout(type, DEFAULT_NODE_SIZE[type]).fit).toBe('contain')
    }
  })
})

describe('minHeightForLabel', () => {
  it('matches the label zone for rectangles', () => {
    expect(minHeightForLabel('rectangle', 160, 100)).toBe(100)
  })

  it('accounts for the cloud label using only part of the height', () => {
    const h = minHeightForLabel('cloud', 180, 60)
    expect(h).toBeGreaterThan(60)
    expect(labelLayout('cloud', { width: 180, height: h }).box.height).toBeGreaterThanOrEqual(60 - 0.5)
  })
})
