import { plainText, stripFences, validateGeneratedJson, type GeneratedDiagram } from './generated'
import { REFINE_CAPS } from './refinePrompt'

/*
 * The refine contract: the 6b generated-diagram contract (new shapes, new
 * connectors), where a connector may also end on an existing shape's ref.
 * ADD-ONLY: anything in the answer that would touch existing content (extra
 * fields such as "update" or "delete", a position, a "new" shape reusing an
 * existing ref) is stripped and counted, never applied. Then every 6b rule
 * applies, with refine's smaller caps. The answer is never trusted.
 */

const TOP_KEYS = new Set(['nodes', 'edges', 'reason'])
const NODE_KEYS = new Set(['id', 'label', 'shape', 'color', 'note'])
const EDGE_KEYS = new Set(['from', 'to', 'label', 'direction', 'style'])

export type RefineChecked =
  | { ok: true; kind: 'add'; diagram: GeneratedDiagram; warnings: string[]; reason: string }
  /** Nothing valid to add: the model's reason (if it gave one) says why. */
  | { ok: true; kind: 'nothing'; warnings: string[]; reason: string }
  | { ok: false; reason: 'malformed'; detail: string }

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** Keeps only `allowed` keys; returns how many others there were. */
function strip(item: Record<string, unknown>, allowed: ReadonlySet<string>): { kept: Record<string, unknown>; extra: number } {
  const kept: Record<string, unknown> = {}
  let extra = 0
  for (const [k, v] of Object.entries(item)) {
    if (allowed.has(k)) kept[k] = v
    else extra++
  }
  return { kept, extra }
}

/**
 * Checks a refine answer against the refs that were sent. `existing`: the
 * refs a connector may end on. Returns the new items, or "nothing" with the
 * model's reason.
 */
export function validateRefine(answer: string, { includeNotes, existing }: { includeNotes: boolean; existing: ReadonlySet<string> }): RefineChecked {
  let json: unknown
  try {
    json = JSON.parse(stripFences(answer))
  } catch {
    return { ok: false, reason: 'malformed', detail: 'The answer wasn’t valid JSON.' }
  }
  if (!isObject(json)) return { ok: false, reason: 'malformed', detail: 'The answer didn’t match the refine format (at the top level).' }
  if ((json.nodes !== undefined && !Array.isArray(json.nodes)) || (json.edges !== undefined && json.edges !== null && !Array.isArray(json.edges)))
    return { ok: false, reason: 'malformed', detail: 'The answer didn’t match the refine format (nodes or edges).' }

  const top = strip(json, TOP_KEYS)
  let stripped = top.extra
  let reused = 0
  const nodes: unknown[] = []
  for (const n of (json.nodes as unknown[] | undefined) ?? []) {
    if (!isObject(n)) return { ok: false, reason: 'malformed', detail: 'The answer didn’t match the refine format (a node).' }
    // A "new" shape with an existing ref would stand in for (and so change) that shape.
    if (existing.has(plainText(String(n.id ?? '')))) {
      reused++
      continue
    }
    const { kept, extra } = strip(n, NODE_KEYS)
    stripped += extra
    nodes.push(kept)
  }
  const edges: unknown[] = []
  for (const e of (json.edges as unknown[] | null | undefined) ?? []) {
    if (!isObject(e)) return { ok: false, reason: 'malformed', detail: 'The answer didn’t match the refine format (a connector).' }
    const { kept, extra } = strip(e, EDGE_KEYS)
    stripped += extra
    edges.push(kept)
  }

  const warnings: string[] = []
  const warn = (message: string) => warnings.push(message)
  if (stripped) warn(`Left out ${plural(stripped, 'field')} that Refine doesn’t take (such as changes to existing items, positions or groups). Existing items are never changed.`)
  if (reused) warn(`Left out ${plural(reused, 'shape')} that reused an existing shape’s name: existing shapes can’t be changed.`)

  const rawReason = typeof json.reason === 'string' ? plainText(json.reason) : ''
  const reason = [...rawReason].length > REFINE_CAPS.reason ? `${[...rawReason].slice(0, REFINE_CAPS.reason - 1).join('').trimEnd()}…` : rawReason

  if (nodes.length === 0) {
    const dropped = edges.length
    if (dropped) warn(`${plural(dropped, 'connector')} had no new shape to connect and ${dropped === 1 ? 'was' : 'were'} left out.`)
    return { ok: true, kind: 'nothing', warnings, reason }
  }

  const checked = validateGeneratedJson(
    { nodes, edges },
    { includeNotes, caps: { nodes: REFINE_CAPS.nodes, edges: REFINE_CAPS.edges, groups: 0 }, existing },
  )
  if (!checked.ok) return { ok: false, reason: 'malformed', detail: checked.detail }
  return { ok: true, kind: 'add', diagram: checked.diagram, warnings: [...warnings, ...checked.warnings], reason }
}
