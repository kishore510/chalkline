import { create } from 'zustand'
import type { Diagram, DiagramEdge, DiagramNode } from '@/schema/diagram'
import { getShape, isKnownShape } from '@/shapes/registry'
import type { FixResult, FixStatus, RefineFix } from './refineFixes'

/*
 * The story of a refinement: each fix and each new item in plain words, with
 * the model's reason. Shown in the preview (before anything changes) and kept
 * in the AI change log after Apply. The log records every AI feature that
 * changes the diagram: Refine, Generate and Suggest notes (Summarise and
 * Review change nothing). It is view state: never saved, never an undo step,
 * never exported; gone on reload.
 */

export type StoryKind = 'added' | 'connected' | 'fixed' | 'removed' | 'skipped'

export interface StoryItem {
  key: string
  kind: StoryKind
  text: string
  why: string
  /** Items to show on the canvas for this line (those still there). */
  ids: string[]
}

const name = (label: string | undefined) => (label?.trim() ? `“${label.trim()}”` : 'an untitled shape')
const shapeName = (type: string) => (isKnownShape(type) ? getShape(type).name.toLowerCase() : type)

function labels(diagram: Diagram, extra: readonly DiagramNode[] = []) {
  const byId = new Map([...diagram.nodes, ...extra].map((n) => [n.id, n]))
  const edges = new Map(diagram.edges.map((e) => [e.id, e]))
  const nodeName = (id: string) => name(byId.get(id)?.label)
  const edgeName = (e: DiagramEdge | undefined) => (e ? `the connector from ${nodeName(e.source)} to ${nodeName(e.target)}${e.label?.trim() ? ` (“${e.label.trim()}”)` : ''}` : 'a connector')
  return { byId, edges, nodeName, edgeName }
}

/** One fix in words, against the diagram before it's applied. */
export function describeFix(diagram: Diagram, fix: RefineFix): string {
  const { byId, edges, nodeName, edgeName } = labels(diagram)
  switch (fix.action) {
    case 'relabel':
      if (fix.target === 'node') return `Renamed ${nodeName(fix.id)} to “${fix.label}”`
      return fix.label ? `Relabelled ${edgeName(edges.get(fix.id))} as “${fix.label}”` : `Cleared the label on ${edgeName(edges.get(fix.id))}`
    case 'reshape': {
      const node = byId.get(fix.id)
      return `Changed ${nodeName(fix.id)} from a ${shapeName(node?.type ?? '')} to a ${shapeName(fix.shape)}`
    }
    case 'redirect': {
      const edge = edges.get(fix.id)
      if (fix.direction === 'none') return `Took the arrowheads off ${edgeName(edge)}`
      if (fix.direction === 'both') return `Made ${edgeName(edge)} point both ways`
      const to = edge ? (fix.from === edge.source ? edge.target : edge.source) : ''
      return `Made the connector between ${nodeName(fix.from)} and ${nodeName(to)} point from ${nodeName(fix.from)} to ${nodeName(to)}`
    }
    case 'remove':
      return fix.target === 'node' ? `Removed ${nodeName(fix.id)} and its connectors` : `Removed ${edgeName(edges.get(fix.id))}`
  }
}

const SKIPPED: Record<Exclude<FixStatus, 'applied'>, string> = {
  unchanged: 'it was already that way',
  gone: 'it was deleted since',
  locked: 'it’s locked or on a hidden layer',
  invalid: 'it couldn’t be made as described',
}

/** The new shapes and connectors in words. `diagram` gives the existing shapes' labels. */
export function describeAdditions(diagram: Diagram, nodes: readonly DiagramNode[], edges: readonly DiagramEdge[], why: ReadonlyMap<string, string>): StoryItem[] {
  const { nodeName } = labels(diagram, nodes)
  const fresh = new Set(nodes.map((n) => n.id))
  const items: StoryItem[] = nodes.map((n) => ({ key: n.id, kind: 'added', text: `Added ${name(n.label)} (${shapeName(n.type)})`, why: why.get(n.id) ?? '', ids: [n.id] }))
  for (const e of edges) {
    const reason = why.get(e.id) ?? ''
    const between = !fresh.has(e.source) && !fresh.has(e.target)
    // Connectors to a new shape are part of adding it; list them only when they say something.
    if (!between && !reason && !e.label?.trim()) continue
    items.push({
      key: e.id,
      kind: 'connected',
      text: `Connected ${nodeName(e.source)} to ${nodeName(e.target)}${e.label?.trim() ? ` (“${e.label.trim()}”)` : ''}`,
      why: reason,
      ids: [e.id],
    })
  }
  return items
}

/** The fixes in words, before applying (results absent) or after (skipped ones say why). */
export function describeFixes(diagram: Diagram, fixes: readonly RefineFix[], results?: readonly FixResult[]): StoryItem[] {
  const status = new Map(results?.map((r) => [r.fix.key, r.status]))
  return fixes.map((fix) => {
    const s = status.get(fix.key) ?? 'applied'
    const text = describeFix(diagram, fix)
    if (s !== 'applied') return { key: fix.key, kind: 'skipped', text: `Skipped: ${text.charAt(0).toLowerCase()}${text.slice(1)}, because ${SKIPPED[s]}`, why: fix.why, ids: [fix.id] }
    return { key: fix.key, kind: fix.action === 'remove' ? 'removed' : 'fixed', text, why: fix.why, ids: fix.action === 'remove' ? [] : [fix.id] }
  })
}

/** The AI features that change the diagram, and so write to the log. */
export type AiLogFeature = 'refine' | 'generate' | 'notes'

export const FEATURE_NAMES: Record<AiLogFeature, string> = { refine: 'Refine', generate: 'Generate', notes: 'Suggest notes' }

export interface LogEntry {
  id: number
  feature: AiLogFeature
  /** When it was applied (ms since epoch). */
  at: number
  instruction: string
  /** What happened, from the result (never the model's word for it). */
  summary: string
  /** The model's own summary, shown apart as its intent (Refine only). */
  intent?: string
  items: StoryItem[]
  /** The undo history length right after applying: Undo here works only while nothing else changed. */
  historySize: number
}

/** Entries kept, newest first. */
export const LOG_LIMIT = 20

interface RefineLogState {
  entries: LogEntry[]
  open: boolean
  /** Adds an entry, newest first. `open` (default true) also shows the log. */
  add: (entry: Omit<LogEntry, 'id'>, options?: { open?: boolean }) => void
  show: () => void
  hide: () => void
  /** For tests. */
  reset: () => void
}

export const useRefineLog = create<RefineLogState>()((set) => ({
  entries: [],
  open: false,
  add: (entry, { open = true } = {}) =>
    set((s) => ({ entries: [{ ...entry, id: (s.entries[0]?.id ?? 0) + 1 }, ...s.entries].slice(0, LOG_LIMIT), ...(open && { open: true }) })),
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
  reset: () => set({ entries: [], open: false }),
}))
