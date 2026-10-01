import { describe, expect, it } from 'vitest'
import { fixtures } from '@/fixtures'
import { parseDiagram } from '@/schema/diagram'
import { centreViewport, floatingEndpoints, focusZoom, revealViewport, selectionBounds } from './floating'

const box = (x: number, y: number, width = 160, height = 80) => ({ x, y, width, height })

describe('floatingEndpoints', () => {
  it.each([
    ['right', box(400, 0), 'right', 'left'],
    ['left', box(-400, 0), 'left', 'right'],
    ['below', box(0, 300), 'bottom', 'top'],
    ['above', box(0, -300), 'top', 'bottom'],
    ['diagonal, mostly across', box(400, 150), 'right', 'left'],
    ['diagonal, mostly down', box(120, 400), 'bottom', 'top'],
  ] as const)('target %s', (_label, target, sourceSide, targetSide) => {
    const ends = floatingEndpoints(box(0, 0), target)
    expect([ends.sourceSide, ends.targetSide]).toEqual([sourceSide, targetSide])
  })

  it('attaches at side midpoints', () => {
    const ends = floatingEndpoints(box(0, 0), box(400, 0))
    expect(ends).toMatchObject({ sourceX: 160, sourceY: 40, targetX: 400, targetY: 40 })
  })

  it('honours a stored side and floats the other', () => {
    const ends = floatingEndpoints(box(0, 0), box(400, 0), 'bottom')
    expect(ends.sourceSide).toBe('bottom')
    expect(ends.targetSide).toBe('left')
  })

  it('still picks sides when nodes overlap', () => {
    const ends = floatingEndpoints(box(0, 0), box(10, 10))
    expect(ends.sourceSide).toBeDefined()
    expect(ends.targetSide).toBeDefined()
  })
})

describe('revealViewport', () => {
  const visible = { width: 360, height: 400 }
  const margin = 16

  it('leaves the view alone when the item is already visible', () => {
    expect(revealViewport(box(0, 0, 100, 50), { x: 50, y: 50, zoom: 1 }, visible, margin)).toBeNull()
  })

  it('centres a hidden item in the visible area at the current zoom', () => {
    const next = revealViewport(box(0, 600, 100, 50), { x: 0, y: 0, zoom: 2 }, visible, margin)
    expect(next).toEqual({ x: 180 - 50 * 2, y: 200 - 625 * 2, zoom: 2 })
  })

  it('treats the margin as part of visibility', () => {
    expect(revealViewport(box(0, 0, 100, 50), { x: 8, y: 50, zoom: 1 }, visible, margin)).not.toBeNull()
  })
})

describe('centreViewport and focusZoom', () => {
  const visible = { width: 400, height: 300 }

  it('centres an item even when it is already visible', () => {
    expect(centreViewport(box(0, 0, 100, 50), 1, visible)).toEqual({ x: 150, y: 125, zoom: 1 })
  })

  it('keeps the zoom, raises it to the minimum, and lowers it to fit', () => {
    expect(focusZoom(box(0, 0, 100, 50), 1.5, visible, 16, 0.75)).toBe(1.5)
    expect(focusZoom(box(0, 0, 100, 50), 0.2, visible, 16, 0.75)).toBe(0.75)
    expect(focusZoom(box(0, 0, 2000, 50), 1, visible, 16, 0.75)).toBeCloseTo(368 / 2000)
  })
})

describe('selectionBounds', () => {
  const d = parseDiagram(fixtures['all-shapes'])
  it('covers selected nodes and both ends of selected edges', () => {
    expect(selectionBounds(d, ['n_rect'])).toEqual({ x: 0, y: 0, width: 160, height: 80 })
    expect(selectionBounds(d, ['e_1'])).toEqual({ x: 0, y: 0, width: 380, height: 80 })
    expect(selectionBounds(d, [])).toBeNull()
  })
})
