import { isKnownShape } from '@/shapes/registry'
import {
  CAPS,
  DIRECTIONS,
  EDGE_STYLES,
  plainText,
  stripFences,
  validateGeneratedJson,
  type GeneratedDiagram,
  type GeneratedEdge,
} from './generated'
import { CHANGE_ACTIONS, REFINE_CAPS } from './refinePrompt'

/*
 * The refine contract: the 6b generated-diagram contract (new shapes, new
 * connectors), where a connector may also end on an existing shape's ref,
 * plus FIXES to existing items: relabel, reshape or remove a selected shape;
 * relabel, redirect or remove a listed connector; and new connectors between
 * two existing shapes. Each item may carry a "why", and the answer a
 * "summary": the narrative shown with the preview. Fixes can only name refs
 * that were sent as changeable; anything else is left out and counted. Then
 * every 6b rule applies, with refine's smaller caps. The answer is never
 * trusted.
 */

const TOP_KEYS = new Set(['nodes', 'edges', 'changes', 'summary', 'reason'])
const NODE_KEYS = new Set(['id', 'label', 'shape', 'color', 'note'])
const EDGE_KEYS = new Set(['from', 'to', 'label', 'direction', 'style'])

type Direction = (typeof DIRECTIONS)[number]

/** A checked fix, still in the refs the model saw. */
export type RefineChange =
  | { action: 'relabel'; ref: string; label: string; why: string }
  | { action: 'reshape'; ref: string; shape: string; why: string }
  | { action: 'redirect'; ref: string; from: string; direction: Direction; why: string }
  | { action: 'remove'; ref: string; why: string }

export interface RefineAnswer {
  /** New shapes and the connectors that touch them. Null when there are no new shapes. */
  diagram: GeneratedDiagram | null
  /** New connectors between two existing shapes (refs). */
  bridges: GeneratedEdge[]
  changes: RefineChange[]
  /** The "why" of new shapes (by their id) and new connectors (by edgeKey). */
  why: { nodes: ReadonlyMap<string, string>; edges: ReadonlyMap<string, string> }
}

export type RefineChecked =
  | ({
      ok: true
      kind: 'refine'
      warnings: string[]
      summary: string
      /** Why this answer looks incomplete (empty when it looks whole): shown before Apply, with Try again. */
      incomplete: string[]
    } & RefineAnswer)
  /** Text fields hold pieces of JSON: the model lost its place, so parts are missing. Never applied. */
  | { ok: true; kind: 'garbled'; warnings: string[]; summary: string; samples: string[] }
  /** Nothing valid to add or fix: the summary (if any) says why. */
  | { ok: true; kind: 'nothing'; warnings: string[]; summary: string }
  | { ok: false; reason: 'malformed'; detail: string }

/*
 * Garbled answers. With structured output the JSON itself is always valid, but
 * a model that loses its place writes the next fields INSIDE a text value:
 * "why": "…origin.','note':'Caches…" or "…routing.'},{". Whatever it meant
 * to write after that is lost, so the whole answer is unusable.
 */
const GARBLED = [
  // ','note': or ","label":
  /['"]\s*,\s*['"]\s*[a-z_]+\s*['"]\s*:/i,
  // 'note':'  or "why": "
  /['"][a-z_]+['"]\s*:\s*['"[{]/i,
  // '},{  or "}, {
  /['"]?\s*\}\s*,\s*\{/,
  // {'id':  or {"from":
  /\{\s*['"][a-z_]+['"]\s*:/i,
  // ends with '} or "}]
  /['"]\s*[}\]]+\s*,?\s*$/,
]

/** Text values that hold pieces of JSON, as short samples (none: the answer reads as plain text). */
export function garbledSamples(json: Record<string, unknown>): string[] {
  const samples: string[] = []
  const visit = (v: unknown) => {
    if (typeof v === 'string') {
      if (GARBLED.some((re) => re.test(v))) samples.push(cap(plainText(v), 120))
    } else if (Array.isArray(v)) v.forEach(visit)
    else if (isObject(v)) Object.values(v).forEach(visit)
  }
  for (const key of ['nodes', 'edges', 'changes', 'summary', 'reason']) visit(json[key])
  return samples.slice(0, 3)
}

/** Words in a summary that claim changes to existing items. */
const CLAIMS_FIXES = /\b(renam|relabel|reshap|rerout|redirect|re-?point|remov|replac|convert|swap|turn(?:ed|s)? (?:the |your |an? )?\w+ (?:in)?to|chang(?:e|ed|es|ing) (?:the |your )?\w+(?: \w+)? (?:in)?to)/i

/** The key a new connector's "why" is filed under. */
export const edgeKey = (from: string, to: string) => `${from}→${to}`

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** Cut to `max` characters, ending with an ellipsis. */
function cap(value: string, max: number): string {
  const chars = [...value]
  return chars.length > max ? `${chars.slice(0, max - 1).join('').trimEnd()}…` : value
}
const textOf = (v: unknown, max: number) => cap(plainText(typeof v === 'string' || typeof v === 'number' ? String(v) : ''), max)

/** Keeps only `allowed` keys; returns how many others there were. */
function strip(item: Record<string, unknown>, allowed: ReadonlySet<string>): { kept: Record<string, unknown>; extra: number } {
  const kept: Record<string, unknown> = {}
  let extra = 0
  for (const [k, v] of Object.entries(item)) {
    if (allowed.has(k)) kept[k] = v
    else if (k !== 'why') extra++
  }
  return { kept, extra }
}

export interface RefineRefs {
  includeNotes: boolean
  /** Refs a connector may end on (selected and neighbouring shapes). */
  existing: ReadonlySet<string>
  /** Refs of shapes a fix may change (the selected ones). */
  editable: ReadonlySet<string>
  /** Refs of connectors a fix may change. */
  connectors: ReadonlySet<string>
}

/** Checks the "changes" list. Returns the fixes kept and warnings for the rest. */
function checkChanges(raw: unknown[], refs: RefineRefs, warn: (m: string) => void): RefineChange[] | null {
  if (raw.length > REFINE_CAPS.changes) warn(`Kept the first ${REFINE_CAPS.changes} changes; ${plural(raw.length - REFINE_CAPS.changes, 'more was', 'more were')} left out.`)
  const changes: RefineChange[] = []
  let unknownRef = 0
  let readOnly = 0
  let invalid = 0
  let repeated = 0
  const touched = new Map<string, Set<string>>()
  for (const c of raw.slice(0, REFINE_CAPS.changes)) {
    if (!isObject(c)) return null
    const action = plainText(String(c.action ?? '')).toLowerCase()
    const ref = plainText(String(c.ref ?? ''))
    const why = textOf(c.why, REFINE_CAPS.why)
    const isShape = refs.editable.has(ref)
    const isConnector = refs.connectors.has(ref)
    if (!(CHANGE_ACTIONS as readonly string[]).includes(action)) {
      invalid++
      continue
    }
    if (!isShape && !isConnector) {
      if (refs.existing.has(ref)) readOnly++
      else unknownRef++
      continue
    }
    // One change of each kind per item; a removal makes the others moot.
    const seen = touched.get(ref) ?? new Set<string>()
    if (seen.has(action) || seen.has('remove')) {
      repeated++
      continue
    }
    let change: RefineChange | null = null
    if (action === 'relabel') {
      const label = textOf(c.label, CAPS.label)
      if (label || isConnector) change = { action, ref, label, why }
    } else if (action === 'reshape') {
      const shape = plainText(String(c.shape ?? ''))
      if (isShape && isKnownShape(shape)) change = { action, ref, shape, why }
    } else if (action === 'redirect') {
      const from = plainText(String(c.from ?? ''))
      const direction = plainText(String(c.direction ?? 'forward')).toLowerCase()
      if (isConnector && refs.existing.has(from) && (DIRECTIONS as readonly string[]).includes(direction)) change = { action, ref, from, direction: direction as Direction, why }
    } else change = { action: 'remove', ref, why }
    if (!change) {
      invalid++
      continue
    }
    if (action === 'remove') {
      // A removal replaces any earlier change to the same item.
      for (let i = changes.length - 1; i >= 0; i--) if (changes[i]!.ref === ref) changes.splice(i, 1)
    }
    seen.add(action)
    touched.set(ref, seen)
    changes.push(change)
  }
  if (readOnly) warn(`Left out ${plural(readOnly, 'change')} to connected shapes that weren’t selected: only selected shapes and their connectors can be changed.`)
  if (unknownRef) warn(`Left out ${plural(unknownRef, 'change')} to something that isn’t in the selection.`)
  if (invalid) warn(`Left out ${plural(invalid, 'change')} that couldn’t be made as described.`)
  if (repeated) warn(`Left out ${plural(repeated, 'change')} that repeated an earlier one.`)
  return changes
}

/** Checks a connector between two existing shapes, or returns null with why. */
function checkBridge(e: Record<string, unknown>, existing: ReadonlySet<string>): GeneratedEdge | 'dangling' | 'loop' {
  const from = plainText(String(e.from ?? ''))
  const to = plainText(String(e.to ?? ''))
  if (!existing.has(from) || !existing.has(to)) return 'dangling'
  if (from === to) return 'loop'
  const direction = plainText(String(e.direction ?? '')).toLowerCase()
  const style = plainText(String(e.style ?? '')).toLowerCase()
  const edge: GeneratedEdge = {
    from,
    to,
    direction: (DIRECTIONS as readonly string[]).includes(direction) ? (direction as Direction) : 'forward',
    style: (EDGE_STYLES as readonly string[]).includes(style) ? (style as GeneratedEdge['style']) : 'solid',
  }
  const label = textOf(e.label, CAPS.label)
  if (label) edge.label = label
  return edge
}

/**
 * Checks a refine answer against the refs that were sent. Returns the new
 * items, the fixes and their reasons, or "nothing" with the model's summary.
 */
export function validateRefine(answer: string, refs: RefineRefs): RefineChecked {
  let json: unknown
  try {
    json = JSON.parse(stripFences(answer))
  } catch {
    return { ok: false, reason: 'malformed', detail: 'The answer wasn’t valid JSON.' }
  }
  if (!isObject(json)) return { ok: false, reason: 'malformed', detail: 'The answer didn’t match the refine format (at the top level).' }
  const garbled = garbledSamples(json)
  if (garbled.length) {
    return {
      ok: true,
      kind: 'garbled',
      warnings: [],
      summary: textOf(json.summary ?? json.reason, REFINE_CAPS.summary),
      samples: garbled,
    }
  }
  for (const key of ['nodes', 'edges', 'changes'] as const) {
    if (json[key] !== undefined && json[key] !== null && !Array.isArray(json[key]))
      return { ok: false, reason: 'malformed', detail: `The answer didn’t match the refine format (${key === 'changes' ? 'changes' : 'nodes or edges'}).` }
  }

  const warnings: string[] = []
  const warn = (message: string) => {
    if (!warnings.includes(message)) warnings.push(message)
  }
  let stripped = strip(json, TOP_KEYS).extra
  let reused = 0

  const nodes: Record<string, unknown>[] = []
  const nodeWhy = new Map<string, string>()
  for (const n of (json.nodes as unknown[] | undefined) ?? []) {
    if (!isObject(n)) return { ok: false, reason: 'malformed', detail: 'The answer didn’t match the refine format (a node).' }
    // A "new" shape with an existing ref would stand in for that shape: fixes go through "changes".
    if (refs.existing.has(plainText(String(n.id ?? '')))) {
      reused++
      continue
    }
    const { kept, extra } = strip(n, NODE_KEYS)
    stripped += extra
    nodes.push(kept)
  }

  const fresh = new Set(nodes.map((n, i) => plainText(String(n.id ?? '')) || `n${i + 1}`))
  const edges: Record<string, unknown>[] = []
  const bridges: GeneratedEdge[] = []
  const edgeWhy = new Map<string, string>()
  let dangling = 0
  let loops = 0
  for (const e of (json.edges as unknown[] | null | undefined) ?? []) {
    if (!isObject(e)) return { ok: false, reason: 'malformed', detail: 'The answer didn’t match the refine format (a connector).' }
    const from = plainText(String(e.from ?? ''))
    const to = plainText(String(e.to ?? ''))
    const why = textOf(e.why, REFINE_CAPS.why)
    if (why) edgeWhy.set(edgeKey(from, to), why)
    if (!fresh.has(from) && !fresh.has(to)) {
      if (bridges.length >= REFINE_CAPS.edges) continue
      const bridge = checkBridge(e, refs.existing)
      if (bridge === 'dangling') dangling++
      else if (bridge === 'loop') loops++
      else if (!bridges.some((b) => (b.from === bridge.from && b.to === bridge.to) || (b.from === bridge.to && b.to === bridge.from))) bridges.push(bridge)
      continue
    }
    const { kept, extra } = strip(e, EDGE_KEYS)
    stripped += extra
    edges.push(kept)
  }
  if (dangling) warn(`${plural(dangling, 'connector')} pointed at a shape that isn’t there and ${dangling === 1 ? 'was' : 'were'} left out.`)
  if (loops) warn(`${plural(loops, 'connector')} joined a shape to itself and ${loops === 1 ? 'was' : 'were'} left out.`)

  const changes = checkChanges((json.changes as unknown[] | null | undefined) ?? [], refs, warn)
  if (!changes) return { ok: false, reason: 'malformed', detail: 'The answer didn’t match the refine format (a change).' }

  if (stripped) warn(`Left out ${plural(stripped, 'field')} that Refine doesn’t take (such as positions, sizes or groups).`)
  if (reused) warn(`Left out ${plural(reused, 'new shape')} that reused an existing shape’s name.`)

  const summary = textOf(json.summary ?? json.reason, REFINE_CAPS.summary)

  let diagram: GeneratedDiagram | null = null
  if (nodes.length > 0) {
    const checked = validateGeneratedJson(
      { nodes, edges },
      { includeNotes: refs.includeNotes, caps: { nodes: REFINE_CAPS.nodes, edges: REFINE_CAPS.edges, groups: 0 }, existing: refs.existing },
    )
    if (!checked.ok) return { ok: false, reason: 'malformed', detail: checked.detail }
    diagram = checked.diagram
    for (const w of checked.warnings) warn(w)
    // Shapes come back in the order given, so a "why" follows its shape by position.
    const raw = (json.nodes as Record<string, unknown>[]).filter((n) => !refs.existing.has(plainText(String(n.id ?? ''))))
    diagram.nodes.forEach((n, i) => {
      const why = textOf(raw[i]?.why, REFINE_CAPS.why)
      if (why) nodeWhy.set(n.id, why)
    })
  } else if (edges.length) {
    warn(`${plural(edges.length, 'connector')} had no new shape to connect and ${edges.length === 1 ? 'was' : 'were'} left out.`)
  }

  if (!diagram && bridges.length === 0 && changes.length === 0) return { ok: true, kind: 'nothing', warnings, summary }

  // Does it hang together? New shapes with no connector, and a summary that claims fixes that aren't there.
  const incomplete: string[] = []
  const newIds = diagram?.nodes.map((n) => n.id) ?? []
  const linked = new Set(diagram?.edges.flatMap((e) => [e.from, e.to]) ?? [])
  const loose = newIds.filter((id) => !linked.has(id)).length
  if (loose > 0 && loose === newIds.length)
    incomplete.push(newIds.length === 1 ? 'The new shape isn’t connected to anything.' : `None of the ${newIds.length} new shapes is connected to anything.`)
  else if (loose > 0) warn(`${plural(loose, 'new shape')} ${loose === 1 ? 'isn’t' : 'aren’t'} connected to anything.`)
  if (changes.length === 0 && CLAIMS_FIXES.test(summary)) incomplete.push('Claude’s summary describes changes to your shapes or connectors, but the answer has none.')

  return { ok: true, kind: 'refine', diagram, bridges, changes, why: { nodes: nodeWhy, edges: edgeWhy }, warnings, summary, incomplete }
}
