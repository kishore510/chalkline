import type { Size } from '@/schema/diagram'
import { getShape } from '@/shapes/registry'
import type { LabelLayout, ShapeGeometry } from '@/shapes/types'

/*
 * Thin accessors over the shape registry, kept for the many callers that
 * only need a shape's artwork or label area. The shapes themselves are
 * defined in src/shapes/registry.ts.
 */

export type { Box, LabelLayout, ShapeGeometry } from '@/shapes/types'
export { ACTOR_FIGURE_RATIO } from '@/shapes/registry'

export function shapeGeometry(type: string, size: Size): ShapeGeometry {
  return getShape(type).geometry(size)
}

export function labelLayout(type: string, size: Size): LabelLayout {
  return getShape(type).label(size)
}

/** Height limit when growing a node to fit its label (matches the schema's practical range). */
const MAX_GROW_HEIGHT = 4000

/**
 * Smallest node height at which the label zone is at least `contentHeight`
 * tall, for a node of the given width. Label zones grow with height, so a
 * binary search is exact enough; the result is rounded up to whole pixels.
 */
export function minHeightForLabel(type: string, width: number, contentHeight: number): number {
  const fits = (h: number) => labelLayout(type, { width, height: h }).box.height >= contentHeight
  if (fits(1)) return 1
  let lo = 1
  let hi = MAX_GROW_HEIGHT
  if (!fits(hi)) return hi
  while (hi - lo > 0.5) {
    const mid = (lo + hi) / 2
    if (fits(mid)) hi = mid
    else lo = mid
  }
  // Smallest whole pixel height that fits.
  let h = Math.ceil(lo)
  while (!fits(h)) h++
  return h
}
