import { z } from 'zod'
import {
  DiagramSchema,
  EdgeSchema,
  GroupSchema,
  migrate,
  NodeSchema,
  SCHEMA_VERSION,
  defaultLayer,
  type DiagramEdge,
  type DiagramGroup,
  type DiagramNode,
} from '@/schema/diagram'

/*
 * Stencil files: a reusable fragment (nodes, edges, groups) in its own
 * envelope. Stencils carry the diagram schema version they were saved at and
 * are migrated by wrapping them in a temporary diagram, so they keep loading
 * after every future schema bump without migrations of their own.
 */

export const STENCIL_KIND = 'chalkline-stencil'
export const LIBRARY_KIND = 'chalkline-stencil-library'

export const MAX_STENCIL_NODES = 500
export const MAX_FILE_BYTES = 2 * 1024 * 1024
export const MAX_LIBRARY_STENCILS = 200
export const MAX_NAME = 100
export const MAX_CATEGORY = 60
export const MAX_TAGS = 20
export const MAX_TAG = 40

/** First schema version with layers; wrapped stencils saved at or after it get a layer list. */
const LAYERS_SINCE = 4

/** A problem with a stencil file, worded for people. */
export class StencilFileError extends Error {
  override name = 'StencilFileError'
}

const clean = (max: number) => z.string().trim().min(1).max(max)

export const StencilContentSchema = z
  .object({
    nodes: z.array(NodeSchema).max(MAX_STENCIL_NODES),
    edges: z.array(EdgeSchema),
    groups: z.array(GroupSchema).default([]),
  })
  .superRefine((content, ctx) => {
    // Same rules as a diagram (unique ids, real endpoints, lanes in pools), and no layer data.
    const result = DiagramSchema.safeParse(wrap(content, SCHEMA_VERSION))
    for (const issue of result.error?.issues ?? []) ctx.addIssue({ code: 'custom', path: issue.path, message: issue.message })
    for (const key of ['nodes', 'edges', 'groups'] as const) {
      content[key].forEach((item, i) => {
        if (item.layerId !== undefined) ctx.addIssue({ code: 'custom', path: [key, i, 'layerId'], message: 'Stencils have no layers' })
      })
    }
  })

export const StencilSchema = z.object({
  kind: z.literal(STENCIL_KIND),
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: z.string().min(1).max(128),
  name: clean(MAX_NAME),
  category: clean(MAX_CATEGORY),
  tags: z.array(clean(MAX_TAG)).max(MAX_TAGS).default([]),
  created: z.iso.datetime(),
  content: StencilContentSchema,
})

export type Stencil = z.infer<typeof StencilSchema>
export type StencilContent = z.infer<typeof StencilContentSchema>

/** Just enough to find the version and content before migrating. */
const LooseStencilSchema = z.object({
  kind: z.literal(STENCIL_KIND),
  schemaVersion: z.number().int().min(1),
  content: z.object({ nodes: z.array(z.unknown()), edges: z.array(z.unknown()), groups: z.array(z.unknown()).optional() }),
})

const LooseLibrarySchema = z.object({ kind: z.literal(LIBRARY_KIND), stencils: z.array(z.unknown()) })

const EPOCH = '2000-01-01T00:00:00.000Z'

/** Drops layer references: stencils have no layers, so any would point nowhere. */
const noLayer = (items: unknown[]) =>
  items.map((item) => {
    if (typeof item !== 'object' || item === null || !('layerId' in item)) return item
    const { layerId: _layer, ...rest } = item as Record<string, unknown>
    return rest
  })

/** A temporary diagram holding stencil content, at `version`. */
function wrap(content: { nodes: unknown[]; edges: unknown[]; groups?: unknown[] }, version: number) {
  return {
    schemaVersion: version,
    meta: { title: 'Stencil', created: EPOCH, updated: EPOCH },
    nodes: noLayer(content.nodes),
    edges: noLayer(content.edges),
    groups: noLayer(content.groups ?? []),
    ...(version >= LAYERS_SINCE && { layers: [defaultLayer()] }),
  }
}

/** Removes what a stencil never keeps: layers and locks. */
export function stripPlacement(content: { nodes: DiagramNode[]; edges: DiagramEdge[]; groups: DiagramGroup[] }): StencilContent {
  const unplace = <T extends { layerId?: string }>({ layerId: _layer, ...item }: T) => item as Omit<T, 'layerId'>
  return {
    nodes: content.nodes.map((n) => ({ ...unplace(n), locked: false })),
    edges: content.edges.map(unplace),
    groups: content.groups.map((g) => ({ ...unplace(g), locked: false })),
  }
}

/** Friendly name for a stencil in messages, even when it didn't parse. */
function nameOf(raw: unknown): string | undefined {
  const name = (raw as { name?: unknown } | null)?.name
  return typeof name === 'string' && name.trim() ? name.trim().slice(0, MAX_NAME) : undefined
}

/**
 * Parses one untrusted stencil: checks the envelope, migrates the content
 * through the diagram migrations, strips layers and locks, then validates.
 * Throws StencilFileError with a message fit to show.
 */
export function parseStencil(raw: unknown): Stencil {
  const loose = LooseStencilSchema.safeParse(raw)
  if (!loose.success) throw new StencilFileError('It isn’t a Chalkline stencil.')
  const { schemaVersion, content } = loose.data
  if (schemaVersion > SCHEMA_VERSION) throw new StencilFileError('It was made by a newer version of Chalkline.')
  if (content.nodes.length > MAX_STENCIL_NODES) throw new StencilFileError(`It has more than ${MAX_STENCIL_NODES} shapes.`)

  let migrated
  try {
    migrated = DiagramSchema.safeParse(migrate(wrap(content, schemaVersion)))
  } catch {
    throw new StencilFileError('Its content couldn’t be upgraded to this version.')
  }
  if (!migrated.success) throw new StencilFileError('Its shapes or connectors are damaged.')

  const result = StencilSchema.safeParse({
    ...(raw as object),
    schemaVersion: SCHEMA_VERSION,
    content: stripPlacement(migrated.data),
  })
  if (!result.success) {
    const field = result.error.issues[0]?.path[0]
    throw new StencilFileError(
      field === 'name' ? 'Its name is missing or too long.' : field === 'category' ? 'Its category is missing or too long.' : field === 'tags' ? 'Its tags are invalid.' : 'Its details are invalid.',
    )
  }
  return result.data
}

export interface SkippedStencil {
  name?: string
  reason: string
}

export interface ParsedFile {
  kind: 'stencil' | 'library'
  stencils: Stencil[]
  skipped: SkippedStencil[]
}

/** Bytes of text as UTF-8. */
export const byteSize = (text: string) => new TextEncoder().encode(text).length

/**
 * Reads a stencil or library file. Whole-file problems (too big, not JSON,
 * not a stencil, too many stencils) throw StencilFileError; individual bad
 * stencils in a library are skipped with a reason.
 */
export function parseStencilFile(text: string): ParsedFile {
  if (byteSize(text) > MAX_FILE_BYTES) throw new StencilFileError('That file is larger than 2 MB, the most Chalkline imports.')
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new StencilFileError('That file isn’t valid JSON.')
  }
  const kind = (raw as { kind?: unknown } | null)?.kind
  if (kind === STENCIL_KIND) {
    try {
      return { kind: 'stencil', stencils: [parseStencil(raw)], skipped: [] }
    } catch (error) {
      throw new StencilFileError(`That stencil can’t be imported. ${(error as Error).message}`)
    }
  }
  const library = LooseLibrarySchema.safeParse(raw)
  if (library.success) {
    const items = library.data.stencils
    if (items.length > MAX_LIBRARY_STENCILS) throw new StencilFileError(`That library has ${items.length} stencils; the most is ${MAX_LIBRARY_STENCILS}.`)
    const out: ParsedFile = { kind: 'library', stencils: [], skipped: [] }
    for (const item of items) {
      try {
        out.stencils.push(parseStencil(item))
      } catch (error) {
        out.skipped.push({ name: nameOf(item), reason: (error as Error).message })
      }
    }
    return out
  }
  const looksLikeDiagram = typeof raw === 'object' && raw !== null && 'schemaVersion' in raw && 'nodes' in raw && 'meta' in raw
  throw new StencilFileError(looksLikeDiagram ? 'That’s a diagram, not a stencil. Open it from the File menu instead.' : 'That file isn’t a Chalkline stencil or stencil library.')
}

/* ---------- Writing ---------- */

/** One stencil as a file. */
export function serializeStencil(stencil: Stencil): string {
  return JSON.stringify(stencil, null, 2) + '\n'
}

/** Several stencils as a library bundle. */
export function serializeLibrary(stencils: readonly Stencil[]): string {
  return JSON.stringify({ kind: LIBRARY_KIND, stencils }, null, 2) + '\n'
}
