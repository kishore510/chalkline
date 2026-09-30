import { z } from 'zod'

/**
 * The Chalkline diagram document.
 *
 * This file is the single source of truth for diagram types: everything else
 * uses the types inferred here. Any change to the shape of the document must
 * bump SCHEMA_VERSION and add a migration in ./migrate.ts, with a test.
 */
export const SCHEMA_VERSION = 1

export const NODE_SHAPES = ['rectangle', 'rounded', 'database', 'cloud', 'actor', 'text'] as const
export const HANDLE_SIDES = ['top', 'right', 'bottom', 'left'] as const
export const ARROWHEADS = ['none', 'arrow'] as const

export const MIN_NODE_SIZE = 16
export const MAX_NODE_SIZE = 4000
export const MAX_LABEL_LENGTH = 2000
export const MAX_TITLE_LENGTH = 200
export const MIN_ZOOM = 0.05
export const MAX_ZOOM = 8

const IdSchema = z.string().min(1).max(128)

export const NodeShapeSchema = z.enum(NODE_SHAPES)
export const HandleSideSchema = z.enum(HANDLE_SIDES)
export const ArrowheadSchema = z.enum(ARROWHEADS)

export const PointSchema = z.strictObject({
  x: z.number(),
  y: z.number(),
})

export const SizeSchema = z.strictObject({
  width: z.number().min(MIN_NODE_SIZE).max(MAX_NODE_SIZE),
  height: z.number().min(MIN_NODE_SIZE).max(MAX_NODE_SIZE),
})

export const NodeSchema = z.strictObject({
  id: IdSchema,
  shape: NodeShapeSchema,
  /** Top-left corner in canvas coordinates. */
  position: PointSchema,
  size: SizeSchema,
  label: z.string().max(MAX_LABEL_LENGTH),
})

export const EdgeSchema = z.strictObject({
  id: IdSchema,
  source: IdSchema,
  target: IdSchema,
  /** Which side of the node the edge attaches to. Omitted means "nearest". */
  sourceHandle: HandleSideSchema.optional(),
  targetHandle: HandleSideSchema.optional(),
  markerStart: ArrowheadSchema,
  markerEnd: ArrowheadSchema,
})

export const ViewportSchema = z.strictObject({
  x: z.number(),
  y: z.number(),
  zoom: z.number().min(MIN_ZOOM).max(MAX_ZOOM),
})

export const DiagramSchema = z
  .strictObject({
    schemaVersion: z.literal(SCHEMA_VERSION),
    id: IdSchema,
    title: z.string().max(MAX_TITLE_LENGTH),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    nodes: z.array(NodeSchema),
    edges: z.array(EdgeSchema),
    viewport: ViewportSchema,
  })
  .superRefine((diagram, ctx) => {
    // Ids are unique across nodes and edges so a selection can hold either.
    const seen = new Set<string>()
    const nodeIds = new Set<string>()
    diagram.nodes.forEach((node, index) => {
      if (seen.has(node.id)) {
        ctx.addIssue({ code: 'custom', message: `Duplicate id "${node.id}"`, path: ['nodes', index, 'id'] })
      }
      seen.add(node.id)
      nodeIds.add(node.id)
    })
    diagram.edges.forEach((edge, index) => {
      if (seen.has(edge.id)) {
        ctx.addIssue({ code: 'custom', message: `Duplicate id "${edge.id}"`, path: ['edges', index, 'id'] })
      }
      seen.add(edge.id)
      for (const end of ['source', 'target'] as const) {
        if (!nodeIds.has(edge[end])) {
          ctx.addIssue({
            code: 'custom',
            message: `Edge ${end} "${edge[end]}" does not match any node`,
            path: ['edges', index, end],
          })
        }
      }
    })
  })

export type NodeShape = z.infer<typeof NodeShapeSchema>
export type HandleSide = z.infer<typeof HandleSideSchema>
export type Arrowhead = z.infer<typeof ArrowheadSchema>
export type Point = z.infer<typeof PointSchema>
export type Size = z.infer<typeof SizeSchema>
export type DiagramNode = z.infer<typeof NodeSchema>
export type DiagramEdge = z.infer<typeof EdgeSchema>
export type Viewport = z.infer<typeof ViewportSchema>
export type Diagram = z.infer<typeof DiagramSchema>
