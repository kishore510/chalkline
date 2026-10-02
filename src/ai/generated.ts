import { z } from 'zod'
import { COLOUR_PRESETS, type ColourPreset } from '@/lib/colour'
import { getShape, isKnownShape } from '@/shapes/registry'

/*
 * The generated-diagram contract: what the model is asked to return for
 * "Generate diagram", and the checks its answer goes through before anything
 * is shown. The model's answer is never trusted: it is parsed as data, unknown
 * fields are dropped, every reference is checked, and the caps are applied
 * here whatever the request asked for. No coordinates: layout is ours.
 */

export const CAPS = {
  nodes: 40,
  edges: 80,
  groups: 8,
  /** Shape, connector and group labels. */
  label: 80,
  note: 200,
  /** The person's description. */
  description: 2000,
} as const

/** The shape a generated node falls back to when the model names one we don't have. */
export const FALLBACK_SHAPE = 'rounded'

export const DIRECTIONS = ['forward', 'both', 'none'] as const
/** Connector styles the model may choose: the existing plain and dashed lines. */
export const EDGE_STYLES = ['solid', 'dashed'] as const

/* ---------- The checked result ---------- */

const Label = z.string().min(1).max(CAPS.label)

export const GeneratedNodeSchema = z.object({
  id: z.string().min(1),
  label: Label,
  shape: z.string().refine(isKnownShape, 'Unknown shape'),
  color: z.enum(COLOUR_PRESETS).optional(),
  note: z.string().min(1).max(CAPS.note).optional(),
})

export const GeneratedEdgeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  label: Label.optional(),
  direction: z.enum(DIRECTIONS),
  style: z.enum(EDGE_STYLES),
})

export const GeneratedGroupSchema = z.object({
  id: z.string().min(1),
  title: Label,
  members: z.array(z.string().min(1)).min(1),
})

/** A generated diagram after every check: known shapes and presets, real references, within the caps. */
export const GeneratedDiagramSchema = z.object({
  nodes: z.array(GeneratedNodeSchema).min(1).max(CAPS.nodes),
  edges: z.array(GeneratedEdgeSchema).max(CAPS.edges),
  groups: z.array(GeneratedGroupSchema).max(CAPS.groups),
})

export type GeneratedNode = z.infer<typeof GeneratedNodeSchema>
export type GeneratedEdge = z.infer<typeof GeneratedEdgeSchema>
export type GeneratedGroup = z.infer<typeof GeneratedGroupSchema>
export type GeneratedDiagram = z.infer<typeof GeneratedDiagramSchema>

/* ---------- What the answer may look like ---------- */

// Loose on values (an unknown shape or colour is fixed up, not fatal), strict on types. Unknown fields are stripped.
const text = z.string().nullish()
const RawSchema = z.object({
  nodes: z.array(z.object({ id: z.union([z.string(), z.number()]), label: text, shape: text, color: text, note: text })),
  edges: z.array(z.object({ from: z.union([z.string(), z.number()]), to: z.union([z.string(), z.number()]), label: text, direction: text, style: text })).nullish(),
  groups: z.array(z.object({ id: z.union([z.string(), z.number()]), title: text, members: z.array(z.union([z.string(), z.number()])) })).nullish(),
})

export type ValidateResult = { ok: true; diagram: GeneratedDiagram; warnings: string[] } | { ok: false; reason: 'malformed' | 'empty'; detail: string }

/** The answer without a Markdown code fence around it, if it has one. */
export function stripFences(answer: string): string {
  const trimmed = answer.trim()
  const fenced = trimmed.match(/^```[\w-]*\s*\n?([\s\S]*?)\n?```$/)
  return (fenced ? fenced[1]! : trimmed).trim()
}

/** Plain text on one line: control characters out, runs of whitespace (newlines included) to one space. */
export function plainText(value: string | null | undefined): string {
  return (value ?? '')
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u2064\ufeff]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Cut to `max` characters (counting characters, not UTF-16 units), ending with an ellipsis. */
function cap(value: string, max: number): { text: string; cut: boolean } {
  const chars = [...value]
  if (chars.length <= max) return { text: value, cut: false }
  return { text: `${chars.slice(0, max - 1).join('').trimEnd()}…`, cut: true }
}

const quote = (s: string) => `“${s}”`
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/**
 * Checks the model's answer and makes it safe to show. Anything that can be
 * fixed is fixed and listed as a warning (unknown shape: a rounded box;
 * unknown colour: dropped; dangling connector: dropped; duplicate id: renamed;
 * over a cap: trimmed). An answer that isn't the expected JSON at all, or has
 * no shapes, fails.
 */
export function validateGenerated(answer: string, options: ValidateOptions): ValidateResult {
  let json: unknown
  try {
    json = JSON.parse(stripFences(answer))
  } catch {
    return { ok: false, reason: 'malformed', detail: 'The answer wasn’t valid JSON.' }
  }
  return validateGeneratedJson(json, options)
}

export interface ValidateOptions {
  includeNotes: boolean
  /** Lower caps for a smaller request (refine). Default: CAPS. */
  caps?: { nodes: number; edges: number; groups: number }
  /**
   * Refs of existing shapes a connector may end on (refine). A connector
   * needs at least one new shape: one joining two existing shapes is left out.
   */
  existing?: ReadonlySet<string>
}

/** validateGenerated on already-parsed JSON. */
export function validateGeneratedJson(json: unknown, { includeNotes, caps = CAPS, existing }: ValidateOptions): ValidateResult {
  const parsed = RawSchema.safeParse(json)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return { ok: false, reason: 'malformed', detail: `The answer didn’t match the diagram format${issue ? ` (at ${issue.path.join('.') || 'the top level'})` : ''}.` }
  }
  const raw = parsed.data
  if (raw.nodes.length === 0) return { ok: false, reason: 'empty', detail: 'The answer had no shapes.' }

  const warnings: string[] = []
  const warn = (message: string) => {
    if (!warnings.includes(message)) warnings.push(message)
  }

  // --- Shapes
  if (raw.nodes.length > caps.nodes) warn(`Kept the first ${caps.nodes} shapes; ${plural(raw.nodes.length - caps.nodes, 'more was', 'more were')} left out.`)
  /** The model's id for each shape → its id here (the first, when the model reused one). */
  const ids = new Map<string, string>()
  const used = new Set<string>()
  const nodes: GeneratedNode[] = raw.nodes.slice(0, caps.nodes).map((n, i) => {
    const wanted = plainText(String(n.id)) || `n${i + 1}`
    let id = wanted
    for (let k = 2; used.has(id); k++) id = `${wanted}-${k}`
    used.add(id)
    if (id !== wanted) warn(`Two shapes had the id ${quote(wanted)}; connectors to it go to the first one.`)
    if (!ids.has(wanted)) ids.set(wanted, id)

    const shapeId = plainText(n.shape)
    const known = isKnownShape(shapeId)
    const shape = known ? shapeId : FALLBACK_SHAPE

    let label = plainText(n.label)
    if (!label) {
      label = getShape(shape).defaultLabel || 'Untitled'
      warn(`A shape had no label, so it’s called ${quote(label)}.`)
    }
    const labelCap = cap(label, CAPS.label)
    if (labelCap.cut) warn(`A label was longer than ${CAPS.label} characters and was shortened.`)
    if (!known) warn(`${quote(labelCap.text)} asked for an unknown shape${shapeId ? ` (${quote(shapeId)})` : ''}, so it’s a rounded box.`)

    const node: GeneratedNode = { id, label: labelCap.text, shape }
    const colour = plainText(n.color).toLowerCase()
    if (colour) {
      if ((COLOUR_PRESETS as readonly string[]).includes(colour)) node.color = colour as ColourPreset
      else warn(`${quote(labelCap.text)} asked for an unknown colour (${quote(plainText(n.color))}), so it keeps the default.`)
    }
    const note = includeNotes ? plainText(n.note) : ''
    if (note) {
      const noteCap = cap(note, CAPS.note)
      if (noteCap.cut) warn(`A note was longer than ${CAPS.note} characters and was shortened.`)
      node.note = noteCap.text
    }
    return node
  })

  // --- Connectors
  const rawEdges = raw.edges ?? []
  if (rawEdges.length > caps.edges) warn(`Kept the first ${caps.edges} connectors; ${plural(rawEdges.length - caps.edges, 'more was', 'more were')} left out.`)
  let dangling = 0
  let loops = 0
  let bothExisting = 0
  const fresh = new Set(ids.values())
  const end = (value: string | number) => {
    const key = plainText(String(value))
    return ids.get(key) ?? (existing?.has(key) ? key : undefined)
  }
  const edges: GeneratedEdge[] = []
  for (const e of rawEdges.slice(0, caps.edges)) {
    const from = end(e.from)
    const to = end(e.to)
    if (!from || !to) {
      dangling++
      continue
    }
    if (from === to) {
      loops++
      continue
    }
    if (!fresh.has(from) && !fresh.has(to)) {
      bothExisting++
      continue
    }
    const direction = plainText(e.direction).toLowerCase()
    const style = plainText(e.style).toLowerCase()
    if (direction && !(DIRECTIONS as readonly string[]).includes(direction)) warn(`A connector had an unknown direction (${quote(plainText(e.direction))}), so it points forward.`)
    if (style && !(EDGE_STYLES as readonly string[]).includes(style)) warn(`A connector had an unknown style (${quote(plainText(e.style))}), so it’s a solid line.`)
    const edge: GeneratedEdge = {
      from,
      to,
      direction: (DIRECTIONS as readonly string[]).includes(direction) ? (direction as GeneratedEdge['direction']) : 'forward',
      style: (EDGE_STYLES as readonly string[]).includes(style) ? (style as GeneratedEdge['style']) : 'solid',
    }
    const label = plainText(e.label)
    if (label) {
      const labelCap = cap(label, CAPS.label)
      if (labelCap.cut) warn(`A label was longer than ${CAPS.label} characters and was shortened.`)
      edge.label = labelCap.text
    }
    edges.push(edge)
  }
  if (dangling) warn(`${plural(dangling, 'connector')} pointed at a shape that isn’t there and ${dangling === 1 ? 'was' : 'were'} left out.`)
  if (loops) warn(`${plural(loops, 'connector')} joined a shape to itself and ${loops === 1 ? 'was' : 'were'} left out.`)
  if (bothExisting) warn(`${plural(bothExisting, 'connector')} joined two existing shapes and ${bothExisting === 1 ? 'was' : 'were'} left out: only connectors to new shapes are added.`)

  // --- Groups: each shape in at most one.
  const rawGroups = raw.groups ?? []
  if (rawGroups.length > caps.groups) warn(`Kept the first ${caps.groups} groups; ${plural(rawGroups.length - caps.groups, 'more was', 'more were')} left out.`)
  const grouped = new Set<string>()
  const groups: GeneratedGroup[] = []
  rawGroups.slice(0, caps.groups).forEach((g, i) => {
    const title = cap(plainText(g.title) || `Group ${i + 1}`, CAPS.label).text
    const members: string[] = []
    for (const m of g.members) {
      const id = ids.get(plainText(String(m)))
      if (!id) continue
      if (grouped.has(id)) {
        warn(`A shape was in more than one group; it stays in the first.`)
        continue
      }
      grouped.add(id)
      members.push(id)
    }
    if (members.length === 0) {
      warn(`The group ${quote(title)} had no shapes and was left out.`)
      return
    }
    groups.push({ id: plainText(String(g.id)) || `g${i + 1}`, title, members })
  })

  const diagram = GeneratedDiagramSchema.parse({ nodes, edges, groups })
  return { ok: true, diagram, warnings }
}
