import { createElement } from 'react'
import { r2 as n } from './outline'
import { circle } from './paths'
import type { Glyph, Pen, ShapeIconComponent } from './types'

/*
 * Glyphs are drawn once, by the shape's own glyph function: on the canvas
 * inside the node, and in the palette as an icon. Nothing else maps a shape
 * to a picture, so the two can't drift apart.
 */

/** A pen that draws the unit square into the box (x, y) to (x + s, y + s). */
export function penAt(x: number, y: number, s: number): Pen {
  return {
    p: (u, v) => `${n(x + u * s)} ${n(y + v * s)}`,
    c: (u, v, r) => circle(x + u * s, y + v * s, r * s),
  }
}

/** Icon box: the 24-unit grid Lucide icons use, with the same 2-unit margin. */
const ICON_SIZE = 24
const ICON_MARGIN = 2

/** The glyph's paths as drawn in the palette icon. */
export const iconPaths = (glyph: Glyph) => glyph(penAt(ICON_MARGIN, ICON_MARGIN, ICON_SIZE - 2 * ICON_MARGIN))

const cache = new WeakMap<Glyph, ShapeIconComponent>()

/** The palette icon for a glyph: one component per glyph, styled like the Lucide icons beside it. */
export function glyphIcon(glyph: Glyph): ShapeIconComponent {
  let icon = cache.get(glyph)
  if (!icon) {
    const paths = iconPaths(glyph)
    icon = ({ className, 'aria-hidden': ariaHidden }) =>
      createElement(
        'svg',
        {
          xmlns: 'http://www.w3.org/2000/svg',
          width: ICON_SIZE,
          height: ICON_SIZE,
          viewBox: `0 0 ${ICON_SIZE} ${ICON_SIZE}`,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 2,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          className,
          'aria-hidden': ariaHidden,
        },
        paths.map((d, i) => createElement('path', { key: i, d })),
      )
    cache.set(glyph, icon)
  }
  return icon
}
