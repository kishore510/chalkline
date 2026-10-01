import { describe, expect, it } from 'vitest'
import { penAt } from './glyphIcon'
import { lucideGlyph } from './lucideGlyph'

/* Lucide path data redrawn through the pen. */

/** A pen over Lucide's own 2..22 area at 1:1, so output coordinates equal the input ones. */
const same = penAt(2, 2, 20)
const draw = (d: string, pen = same) => lucideGlyph([d])(pen)[0]

describe('lucideGlyph', () => {
  it('makes relative commands absolute and turns H and V into lines', () => {
    expect(draw('M4 4h2v2H4z')).toBe('M4 4L6 4L6 6L4 6Z')
    expect(draw('m10 10-1 1')).toBe('M10 10L9 11')
  })

  it('reads packed numbers and keeps arc flags', () => {
    expect(draw('M10 10a1 1 0 0 1-2-2')).toBe('M10 10A1 1 0 0 1 8 8')
    expect(draw('M10 10c.5-.5 1 0 1.5.5')).toBe('M10 10C10.5 9.5 11 10 11.5 10.5')
  })

  it('scales points and arc radii into the glyph box', () => {
    // Half size, moved to (0, 0): Lucide's (2, 2) lands on the origin.
    expect(draw('M2 2a4 4 0 0 1 4 4', penAt(0, 0, 10))).toBe('M0 0A2 2 0 0 1 2 2')
  })

  it('returns to the start of the subpath after Z', () => {
    expect(draw('M4 4h2zl1 1')).toBe('M4 4L6 4ZL5 5')
  })
})
