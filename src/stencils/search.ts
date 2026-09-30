/* Palette logic for stencils and templates: search, category filter, recently used. */

export interface Searchable {
  id: string
  name: string
  category: string
  tags: readonly string[]
}

export const MAX_RECENT_STENCILS = 6

/** Items whose name, category or tags contain every word of the query, in `category` if given. */
export function searchItems<T extends Searchable>(items: readonly T[], query: string, category?: string | null): T[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  return items.filter((item) => {
    if (category && item.category !== category) return false
    const haystack = `${item.name} ${item.category} ${item.tags.join(' ')}`.toLowerCase()
    return words.every((w) => haystack.includes(w))
  })
}

/** Distinct categories, sorted. */
export const categoriesOf = (items: readonly Searchable[]) => [...new Set(items.map((i) => i.category))].sort((a, b) => a.localeCompare(b))

/** Most recent first, no duplicates, capped. */
export function pushRecentStencil(recent: readonly string[], id: string): string[] {
  return [id, ...recent.filter((r) => r !== id)].slice(0, MAX_RECENT_STENCILS)
}

/** Sanitises a stored list of ids. */
export function cleanRecentStencils(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  for (const v of value) if (typeof v === 'string' && v && !out.includes(v)) out.push(v)
  return out.slice(0, MAX_RECENT_STENCILS)
}
