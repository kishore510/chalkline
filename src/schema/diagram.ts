import { z } from 'zod'

/**
 * Diagram document schema. Single source of truth for types.
 * Any change here requires: bump SCHEMA_VERSION, add a migration, add a test.
 */
export const SCHEMA_VERSION = 1

/* ---------- Primitives ---------- */

// Colours are either a literal hex value or a design-token reference
// (e.g. "token:accent"). Token references let diagrams follow light/dark themes.
export const ColourSchema = z.string().regex(/^(#[0-9a-fA-F]{6}|token:[a-z0-9-]+)$/, 'Use #RRGGBB or token:name')

export const PositionSchema = z.object({
  x: z.number(),
  y: z.number(),
})

export const SizeSchema = z.object({
  width: z.number().positive(),
  height: z.number().positive(),
})

/* ---------- Nodes ---------- */

export const NodeTypeSchema = z.enum(['rectangle', 'rounded', 'database', 'cloud', 'actor', 'text'])
export const NODE_TYPES = NodeTypeSchema.options

export const NodeStyleSchema = z
  .object({
    fill: ColourSchema,
    stroke: ColourSchema,
    strokeWidth: z.number().min(0).max(12),
    textColour: ColourSchema,
    fontSize: z.number().min(8).max(72),
  })
  .partial() // every field optional: missing means "use the theme default"

export const NodeSchema = z.object({
  id: z.string().min(1),
  type: NodeTypeSchema,
  position: PositionSchema,
  size: SizeSchema,
  label: z.string().default(''),
  notes: z.string().default(''),
  style: NodeStyleSchema.default({}),
  groupId: z.string().min(1).optional(), // reserved for Phase 4
})

/* ---------- Edges ---------- */

export const EdgeLineTypeSchema = z.enum(['straight', 'step', 'smoothstep', 'bezier'])

export const ArrowheadSchema = z.enum(['none', 'arrow', 'closed'])

export const EdgeStyleSchema = z
  .object({
    lineType: EdgeLineTypeSchema,
    dashed: z.boolean(),
    startArrow: ArrowheadSchema,
    endArrow: ArrowheadSchema,
    colour: ColourSchema,
    width: z.number().min(0.5).max(12),
  })
  .partial()

export const EdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  sourceHandle: z.string().optional(),
  targetHandle: z.string().optional(),
  label: z.string().default(''),
  notes: z.string().default(''),
  style: EdgeStyleSchema.default({}),
})

/* ---------- Groups (reserved for Phase 4) ---------- */

export const GroupSchema = z.object({
  id: z.string().min(1),
  label: z.string().default(''),
  position: PositionSchema,
  size: SizeSchema,
  style: NodeStyleSchema.default({}),
  collapsed: z.boolean().default(false),
})

/* ---------- Document ---------- */

export const MetaSchema = z.object({
  title: z.string().default('Untitled diagram'),
  created: z.iso.datetime(),
  updated: z.iso.datetime(),
})

export const DiagramSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    meta: MetaSchema,
    nodes: z.array(NodeSchema),
    edges: z.array(EdgeSchema),
    groups: z.array(GroupSchema).default([]),
  })
  .superRefine((d, ctx) => {
    const nodeIds = new Set<string>()
    const groupIds = new Set(d.groups.map((g) => g.id))

    d.nodes.forEach((n, i) => {
      if (nodeIds.has(n.id)) {
        ctx.addIssue({ code: 'custom', path: ['nodes', i, 'id'], message: `Duplicate node id "${n.id}"` })
      }
      nodeIds.add(n.id)
      if (n.groupId && !groupIds.has(n.groupId)) {
        ctx.addIssue({ code: 'custom', path: ['nodes', i, 'groupId'], message: `Unknown group "${n.groupId}"` })
      }
    })

    const edgeIds = new Set<string>()
    d.edges.forEach((e, i) => {
      if (edgeIds.has(e.id)) {
        ctx.addIssue({ code: 'custom', path: ['edges', i, 'id'], message: `Duplicate edge id "${e.id}"` })
      }
      edgeIds.add(e.id)
      if (!nodeIds.has(e.source)) {
        ctx.addIssue({ code: 'custom', path: ['edges', i, 'source'], message: `Edge source "${e.source}" does not exist` })
      }
      if (!nodeIds.has(e.target)) {
        ctx.addIssue({ code: 'custom', path: ['edges', i, 'target'], message: `Edge target "${e.target}" does not exist` })
      }
    })
  })

/* ---------- Inferred types ---------- */

export type Diagram = z.infer<typeof DiagramSchema>
/** A document as stored on disk, before defaults are filled in. */
export type DiagramInput = z.input<typeof DiagramSchema>
export type DiagramNode = z.infer<typeof NodeSchema>
export type DiagramEdge = z.infer<typeof EdgeSchema>
export type DiagramGroup = z.infer<typeof GroupSchema>
export type NodeType = z.infer<typeof NodeTypeSchema>
export type NodeStyle = z.infer<typeof NodeStyleSchema>
export type EdgeStyle = z.infer<typeof EdgeStyleSchema>
export type Position = z.infer<typeof PositionSchema>
export type Size = z.infer<typeof SizeSchema>

/* ---------- Loading and migration ---------- */

type RawDocument = Record<string, unknown> & { schemaVersion?: unknown }
export type Migration = (doc: RawDocument) => RawDocument

/**
 * Migrations keyed by the version they upgrade FROM.
 * Example for a future v2:
 *   1: (doc) => ({ ...doc, schemaVersion: 2, newField: "default" }),
 */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {}

/** Steps a raw document up to `target`. `steps` is injectable for tests. */
export function migrate(raw: unknown, target: number = SCHEMA_VERSION, steps: Readonly<Record<number, Migration>> = MIGRATIONS): unknown {
  if (typeof raw !== 'object' || raw === null) return raw
  let doc = raw as RawDocument
  let version = typeof doc.schemaVersion === 'number' ? doc.schemaVersion : 0

  if (version > target) {
    throw new Error(`Diagram was saved with a newer schema (v${version}). This app supports up to v${target}.`)
  }
  while (version < target) {
    const step = steps[version]
    if (!step) throw new Error(`No migration from schema v${version}.`)
    doc = step(doc)
    if (typeof doc.schemaVersion !== 'number' || doc.schemaVersion <= version) {
      throw new Error(`Migration from schema v${version} did not advance the version.`)
    }
    version = doc.schemaVersion
  }
  return doc
}

/** Parse untrusted JSON (file import, browser storage): migrate, then validate. */
export function parseDiagram(raw: unknown): Diagram {
  return DiagramSchema.parse(migrate(raw))
}

/** Non-throwing variant for UI code that wants to show a friendly error. */
export function safeParseDiagram(raw: unknown) {
  try {
    return DiagramSchema.safeParse(migrate(raw))
  } catch (err) {
    return { success: false as const, error: err as Error }
  }
}

/** A valid empty diagram, used for "New diagram". */
export function createEmptyDiagram(title = 'Untitled diagram'): Diagram {
  const now = new Date().toISOString()
  return {
    schemaVersion: SCHEMA_VERSION,
    meta: { title, created: now, updated: now },
    nodes: [],
    edges: [],
    groups: [],
  }
}
