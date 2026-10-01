import { CATEGORIES, isKnownShape, SHAPES } from '@/shapes/registry'
import type { ShapeCategory, ShapeDefinition } from '@/shapes/types'

/* Palette logic kept out of the components: search, grouping, recently used. */

export const MAX_RECENTS = 6

const categoryName = new Map(CATEGORIES.map((c) => [c.id, c.name]))

/** Shapes whose name, id, category, description or keywords contain every word of the query. */
export function searchShapes(query: string, shapes: readonly ShapeDefinition[] = SHAPES): ShapeDefinition[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return [...shapes]
  return shapes.filter((s) => {
    const haystack = [s.name, s.id, categoryName.get(s.category) ?? s.category, s.description ?? '', ...(s.keywords ?? [])].join(' ').toLowerCase()
    return words.every((w) => haystack.includes(w))
  })
}

export interface CategoryGroup {
  id: ShapeCategory
  name: string
  shapes: ShapeDefinition[]
}

export function byCategory(shapes: readonly ShapeDefinition[]): CategoryGroup[] {
  return CATEGORIES.map((c) => ({ ...c, shapes: shapes.filter((s) => s.category === c.id) })).filter((g) => g.shapes.length > 0)
}

/** Most recent first, no duplicates, at most MAX_RECENTS. */
export function pushRecent(recent: readonly string[], id: string): string[] {
  return [id, ...recent.filter((r) => r !== id)].slice(0, MAX_RECENTS)
}

/** Sanitises a stored list: known shape ids only, deduplicated, capped. */
export function cleanRecents(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  for (const v of value) if (typeof v === 'string' && isKnownShape(v) && !out.includes(v)) out.push(v)
  return out.slice(0, MAX_RECENTS)
}
