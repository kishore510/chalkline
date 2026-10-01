import { createId } from '@/lib/id'
import { fileNameFor } from '@/persistence/serialize'
import {
  MAX_CATEGORY,
  MAX_LIBRARY_STENCILS,
  MAX_NAME,
  MAX_TAG,
  MAX_TAGS,
  parseStencil,
  serializeLibrary,
  serializeStencil,
  STENCIL_KIND,
  type ParsedFile,
  type SkippedStencil,
  type Stencil,
  type StencilContent,
} from './format'
import type { StencilRecord, StencilRepository } from './repository'
import { SCHEMA_VERSION } from '@/schema/diagram'

/*
 * The user's stencil library: every change to it goes through here. Keeps an
 * in-memory copy of the records and writes through to a repository
 * (IndexedDB in the browser). Nothing here touches the diagram or its undo
 * history.
 */

/** A library problem, worded for people. */
export class LibraryError extends Error {
  override name = 'LibraryError'
}

export const QUOTA_MESSAGE = 'Your browser’s storage is full, so the stencil library couldn’t be saved. Delete some stencils, or export your library as a backup.'
export const UNAVAILABLE_MESSAGE = 'The stencil library isn’t available in this browser (storage may be blocked, e.g. in private browsing).'
export const FULL_MESSAGE = `Your library is full (${MAX_LIBRARY_STENCILS} stencils). Delete some to make room.`

export const isQuotaError = (error: unknown) =>
  typeof error === 'object' && error !== null && ((error as { name?: string }).name === 'QuotaExceededError' || (error as { code?: number }).code === 22)

function friendly(error: unknown): LibraryError {
  if (error instanceof LibraryError) return error
  return new LibraryError(isQuotaError(error) ? QUOTA_MESSAGE : UNAVAILABLE_MESSAGE)
}

export interface StencilDetails {
  name: string
  category: string
  tags: readonly string[]
}

/** Trimmed, length-capped details; tags deduplicated (ignoring case), empty ones dropped. */
export function cleanDetails(details: StencilDetails): { name: string; category: string; tags: string[] } {
  const name = details.name.trim().slice(0, MAX_NAME)
  const category = details.category.trim().slice(0, MAX_CATEGORY)
  if (!name) throw new LibraryError('Give the stencil a name.')
  if (!category) throw new LibraryError('Choose or type a category.')
  const tags: string[] = []
  for (const raw of details.tags) {
    const tag = raw.trim().slice(0, MAX_TAG)
    if (tag && !tags.some((t) => t.toLowerCase() === tag.toLowerCase())) tags.push(tag)
  }
  return { name, category, tags: tags.slice(0, MAX_TAGS) }
}

/** "a, b ,c" → ["a", "b", "c"] */
export const splitTags = (text: string) => text.split(',').map((t) => t.trim()).filter(Boolean)

const key = (name: string) => name.trim().toLowerCase()

/** `name`, or "name (2)", "name (3)"… if taken (ignoring case). */
export function uniqueName(name: string, taken: Iterable<string>): string {
  const used = new Set([...taken].map(key))
  if (!used.has(key(name))) return name
  for (let i = 2; ; i++) {
    const suffix = ` (${i})`
    const candidate = name.slice(0, MAX_NAME - suffix.length) + suffix
    if (!used.has(key(candidate))) return candidate
  }
}

export interface ImportClash {
  incoming: Stencil
  existing: StencilRecord
}

export interface ImportPlan {
  /** Stencils with no name clash. */
  fresh: Stencil[]
  /** Stencils whose name matches one already in the library: ask keep both or replace. */
  clashes: ImportClash[]
  skipped: SkippedStencil[]
}

export type ClashChoice = 'keep-both' | 'replace'

export interface ImportResult {
  added: number
  replaced: number
  skipped: SkippedStencil[]
}

export interface LibraryOptions {
  repository: StencilRepository
  /** Preview SVG for stencil content. */
  thumbnail: (content: StencilContent) => string
  now?: () => Date
  makeId?: () => string
}

export type Library = ReturnType<typeof createLibrary>

export function createLibrary({ repository, thumbnail, now = () => new Date(), makeId = () => createId('s_') }: LibraryOptions) {
  let records: StencilRecord[] = []

  const sorted = () => [...records].sort((a, b) => a.stencil.name.localeCompare(b.stencil.name))
  const byId = (id: string) => records.find((r) => r.id === id)
  const record = (stencil: Stencil, cached?: string): StencilRecord => ({
    id: stencil.id,
    stencil,
    thumbnail: cached ?? thumbnail(stencil.content),
    updated: now().toISOString(),
  })

  /** Writes to storage first; memory changes only if that worked. */
  const write = async (put: StencilRecord[], remove: string[] = []) => {
    try {
      if (put.length) await repository.put(put)
      if (remove.length) await repository.remove(remove)
    } catch (error) {
      throw friendly(error)
    }
    const gone = new Set([...remove, ...put.map((r) => r.id)])
    records = [...records.filter((r) => !gone.has(r.id)), ...put]
  }

  const build = (id: string, details: StencilDetails, content: StencilContent, created = now().toISOString()): Stencil =>
    parseStencil({ kind: STENCIL_KIND, schemaVersion: SCHEMA_VERSION, id, ...cleanDetails(details), created, content })

  return {
    /** Records sorted by name. */
    all: sorted,
    get: byId,
    /** Categories in use, sorted. */
    categories: () => [...new Set(records.map((r) => r.stencil.category))].sort((a, b) => a.localeCompare(b)),

    /**
     * Reads the library. Saved stencils are migrated like imports (so they
     * survive schema bumps); unreadable ones are left out.
     */
    async load(): Promise<StencilRecord[]> {
      let stored: StencilRecord[]
      try {
        stored = await repository.list()
      } catch (error) {
        throw friendly(error)
      }
      records = []
      for (const r of stored) {
        try {
          const stencil = parseStencil(r.stencil)
          const current = (r.stencil as { schemaVersion?: unknown }).schemaVersion === SCHEMA_VERSION && typeof r.thumbnail === 'string'
          records.push({ id: stencil.id, stencil, thumbnail: current ? r.thumbnail : thumbnail(stencil.content), updated: typeof r.updated === 'string' ? r.updated : stencil.created })
        } catch {
          // Damaged record: skip it rather than lose the whole library.
        }
      }
      return sorted()
    },

    /** Saves new content as a stencil. Not a diagram change. */
    async save(details: StencilDetails, content: StencilContent): Promise<StencilRecord> {
      if (records.length >= MAX_LIBRARY_STENCILS) throw new LibraryError(FULL_MESSAGE)
      const r = record(build(makeId(), details, content))
      await write([r])
      return r
    },

    /** Rename, or change category and tags. */
    async update(id: string, details: StencilDetails): Promise<StencilRecord> {
      const existing = byId(id)
      if (!existing) throw new LibraryError('That stencil no longer exists.')
      const r = record({ ...existing.stencil, ...cleanDetails(details) }, existing.thumbnail)
      await write([r])
      return r
    },

    /** Deletes a stencil and returns it, for Undo. */
    async remove(id: string): Promise<StencilRecord | null> {
      const existing = byId(id)
      if (!existing) return null
      await write([], [id])
      return existing
    },

    /** Puts a deleted stencil back. */
    async restore(r: StencilRecord): Promise<void> {
      if (!byId(r.id) && records.length >= MAX_LIBRARY_STENCILS) throw new LibraryError(FULL_MESSAGE)
      await write([r])
    },

    /** An editable copy in the library (also "Duplicate to my library" for built-ins). */
    async duplicate(stencil: Stencil, cachedThumbnail?: string): Promise<StencilRecord> {
      if (records.length >= MAX_LIBRARY_STENCILS) throw new LibraryError(FULL_MESSAGE)
      const name = uniqueName(byId(stencil.id) ? `${stencil.name} copy` : stencil.name, records.map((r) => r.stencil.name))
      const r = record({ ...stencil, id: makeId(), name, created: now().toISOString() }, cachedThumbnail)
      await write([r])
      return r
    },

    /** Sorts a parsed file into stencils that can go straight in and name clashes. */
    planImport(file: ParsedFile): ImportPlan {
      const plan: ImportPlan = { fresh: [], clashes: [], skipped: [...file.skipped] }
      for (const incoming of file.stencils) {
        const existing = records.find((r) => key(r.stencil.name) === key(incoming.name))
        if (existing) plan.clashes.push({ incoming, existing })
        else plan.fresh.push(incoming)
      }
      return plan
    },

    /**
     * Imports a plan in one write. Clashes either keep both (the import gets a
     * numbered name) or replace the existing stencil (keeping its id).
     * Stencils past the library limit are skipped.
     */
    async applyImport(plan: ImportPlan, choice: ClashChoice): Promise<ImportResult> {
      const skipped = [...plan.skipped]
      const put: StencilRecord[] = []
      const names = records.map((r) => r.stencil.name)
      const ids = new Set(records.map((r) => r.id))
      let room = MAX_LIBRARY_STENCILS - records.length
      let replaced = 0

      const add = (stencil: Stencil) => {
        if (room <= 0) return skipped.push({ name: stencil.name, reason: FULL_MESSAGE })
        const name = uniqueName(stencil.name, names)
        const id = stencil.id && !ids.has(stencil.id) ? stencil.id : makeId()
        names.push(name)
        ids.add(id)
        room--
        put.push(record({ ...stencil, id, name }))
      }

      for (const s of plan.fresh) add(s)
      for (const { incoming, existing } of plan.clashes) {
        if (choice === 'replace' && !put.some((r) => r.id === existing.id)) {
          put.push(record({ ...incoming, id: existing.id, name: existing.stencil.name }))
          replaced++
        } else {
          add(incoming)
        }
      }
      await write(put)
      return { added: put.length - replaced, replaced, skipped }
    },

    /**
     * Replaces the whole library (restoring a backup) in one transaction per
     * step. Stencils past the library limit are left out.
     */
    async replaceAll(stencils: readonly Stencil[]): Promise<void> {
      const put = stencils.slice(0, MAX_LIBRARY_STENCILS).map((s) => record(s))
      const keep = new Set(put.map((r) => r.id))
      await write(put, records.filter((r) => !keep.has(r.id)).map((r) => r.id))
    },

    exportOne: (stencil: Stencil) => ({ fileName: fileNameFor(stencil.name, 'stencil.json'), text: serializeStencil(stencil) }),
    exportAll: () => ({ fileName: 'chalkline-stencils.json', text: serializeLibrary(sorted().map((r) => r.stencil)) }),
  }
}

/** "Imported 3 stencils. Replaced 1. Skipped 2: …" */
export function describeImport(result: ImportResult): string {
  const parts: string[] = []
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
  if (result.added) parts.push(`Imported ${plural(result.added, 'stencil')}.`)
  if (result.replaced) parts.push(`Replaced ${plural(result.replaced, 'stencil')}.`)
  if (!result.added && !result.replaced) parts.push('Nothing was imported.')
  if (result.skipped.length) {
    const first = result.skipped[0]!
    parts.push(`Skipped ${result.skipped.length}: ${first.name ? `“${first.name}” ` : ''}${first.reason.replace(/^./, (c) => c.toLowerCase())}${result.skipped.length > 1 ? ' …' : ''}`)
  }
  return parts.join(' ')
}
