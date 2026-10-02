import { createElement } from 'react'
import { r2 as n } from './outline'
import { circle } from './paths'
import type { Size } from '@/schema/diagram'
import type { Glyph, Pen, ShapeGeometry, ShapeIconComponent } from './types'

/*
 * Glyphs are drawn once, by the shape's own glyph function: on the canvas
 * inside the node, and in the palette as an icon. Nothing else maps a shape
 * to a picture, so the two can't drift apart. Shapes added since pack 4
 * have no glyph but follow the same rule: their icon is their own outline.
 */

/** A pen that draws the unit square into the box (x, y) to (x + s, y + s). */
export function penAt(x: number, y: number, s: number): Pen {
  return {
    p: (u, v) => `${n(x + u * s)} ${n(y + v * s)}`,
    c: (u, v, r) => circle(x + u * s, y + v * s, r * s),
    l: (d) => `${n(d * s)}`,
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

type GeometryFn = (size: Size) => ShapeGeometry

/** The outline's paths as the canvas draws them at `size`, body then detail. */
export const outlinePaths = (geometry: GeometryFn, size: Size) => {
  const { body, detail } = geometry(size)
  return [...body, ...detail]
}

/** Widest an outline icon gets (either way round), so long shapes stay legible at icon size. */
const ICON_ASPECT = 1.5

/** The size an outline icon is drawn at: the default size, made no more than 3:2. */
export const outlineIconSize = ({ width, height }: Size): Size => ({ width: Math.min(width, height * ICON_ASPECT), height: Math.min(height, width * ICON_ASPECT) })

/** The outline icon's paths: the shape's own geometry, drawn at outlineIconSize. */
export const outlineIconPaths = (geometry: GeometryFn, size: Size) => outlinePaths(geometry, outlineIconSize(size))

const outlineCache = new WeakMap<GeometryFn, ShapeIconComponent>()

/**
 * The palette icon for a shape without a glyph, drawn by the shape's own
 * geometry function (the one the canvas and export use) at outlineIconSize,
 * fitted into the same 24-unit box, margin and stroke weight as the Lucide
 * icons.
 */
export function outlineIcon(geometry: GeometryFn, defaultSize: Size): ShapeIconComponent {
  let icon = outlineCache.get(geometry)
  if (!icon) {
    const size = outlineIconSize(defaultSize)
    const paths = outlinePaths(geometry, size)
    const side = (Math.max(size.width, size.height) * ICON_SIZE) / (ICON_SIZE - 2 * ICON_MARGIN)
    const viewBox = [(size.width - side) / 2, (size.height - side) / 2, side, side].map(n).join(' ')
    const strokeWidth = n((2 * side) / ICON_SIZE)
    icon = ({ className, 'aria-hidden': ariaHidden }) =>
      createElement(
        'svg',
        {
          xmlns: 'http://www.w3.org/2000/svg',
          width: ICON_SIZE,
          height: ICON_SIZE,
          viewBox,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          className,
          'aria-hidden': ariaHidden,
        },
        paths.map((d, i) => createElement('path', { key: i, d })),
      )
    outlineCache.set(geometry, icon)
  }
  return icon
}
