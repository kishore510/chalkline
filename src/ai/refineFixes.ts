import type { Diagram, DiagramEdge, EdgeStyle } from '@/schema/diagram'
import { getShape, isKnownShape } from '@/shapes/registry'
import { isNodeLocked } from '@/store/groups'
import { isEdgeHidden, isEdgeLocked, isNodeHidden } from '@/store/layers'
import * as ops from '@/store/ops'
import type { DIRECTIONS } from './generated'
import type { RefineChange } from './refineContract'

/*
 * Refine's fixes to existing items, in real ids: resolved from the refs the
 * model saw, then applied to the diagram as it is when the person chooses
 * Apply. Pure. A fix to something deleted, locked or hidden since is skipped
 * and reported, never forced. Relabels, reshapes and redirects go first,
 * removals last, so a fix never lands on something another fix removed.
 */

type Direction = (typeof DIRECTIONS)[number]
type Arrowhead = NonNullable<EdgeStyle['endArrow']>

export type RefineFix = { key: string; why: string } & (
  | { action: 'relabel'; target: 'node' | 'edge'; id: string; label: string }
  | { action: 'reshape'; id: string; shape: string }
  /** `from`: the shape the arrow should leave (one of the connector's ends). `head`: the arrowhead to draw if it has none. */
  | { action: 'redirect'; id: string; from: string; direction: Direction; head: Arrowhead }
  | { action: 'remove'; target: 'node' | 'edge'; id: string }
)

export type FixStatus = 'applied' | 'unchanged' | 'gone' | 'locked' | 'invalid'

export interface FixResult {
  fix: RefineFix
  status: FixStatus
}

/** Maps the model's refs to ids. A ref that maps to nothing is dropped (the contract already checked them). */
export function resolveFixes(
  changes: readonly RefineChange[],
  maps: { editable: ReadonlyMap<string, string>; connectors: ReadonlyMap<string, string>; refs: ReadonlyMap<string, string> },
  arrowhead: Arrowhead,
): RefineFix[] {
  const fixes: RefineFix[] = []
  changes.forEach((c, i) => {
    const key = `f${i + 1}`
    const node = maps.editable.get(c.ref)
    const edge = maps.connectors.get(c.ref)
    const target = node ? ('node' as const) : ('edge' as const)
    const id = node ?? edge
    if (!id) return
    if (c.action === 'relabel') fixes.push({ key, why: c.why, action: 'relabel', target, id, label: c.label })
    else if (c.action === 'reshape' && node) fixes.push({ key, why: c.why, action: 'reshape', id: node, shape: c.shape })
    else if (c.action === 'redirect' && edge) {
      const from = maps.refs.get(c.from)
      if (from) fixes.push({ key, why: c.why, action: 'redirect', id: edge, from, direction: c.direction, head: arrowhead === 'none' ? 'arrow' : arrowhead })
    } else if (c.action === 'remove') fixes.push({ key, why: c.why, action: 'remove', target, id })
  })
  return fixes
}

const ARROW_DEFAULTS = { start: 'none', end: 'arrow' } as const

/** The arrow style a redirect asks for, or null if `from` isn't one of the connector's ends. */
function redirectedStyle(edge: DiagramEdge, fix: Extract<RefineFix, { action: 'redirect' }>): Pick<EdgeStyle, 'startArrow' | 'endArrow'> | null {
  const start = edge.style.startArrow ?? ARROW_DEFAULTS.start
  const end = edge.style.endArrow ?? ARROW_DEFAULTS.end
  const head = end !== 'none' ? end : start !== 'none' ? start : fix.head
  if (fix.direction === 'none') return { startArrow: 'none', endArrow: 'none' }
  if (fix.direction === 'both') return { startArrow: head, endArrow: head }
  if (fix.from === edge.source) return { startArrow: 'none', endArrow: head }
  if (fix.from === edge.target) return { startArrow: head, endArrow: 'none' }
  return null
}

const ORDER: Record<RefineFix['action'], number> = { relabel: 0, reshape: 0, redirect: 0, remove: 1 }

/** Whether a fix's item can be changed right now: it exists, isn't locked and isn't on a hidden layer. */
function check(d: Diagram, fix: RefineFix): 'ok' | 'gone' | 'locked' {
  const isNode = fix.action === 'reshape' || ((fix.action === 'relabel' || fix.action === 'remove') && fix.target === 'node')
  if (isNode) {
    const node = d.nodes.find((n) => n.id === fix.id)
    if (!node) return 'gone'
    return isNodeLocked(d, node) || isNodeHidden(d, node) ? 'locked' : 'ok'
  }
  const edge = d.edges.find((e) => e.id === fix.id)
  if (!edge) return 'gone'
  return isEdgeLocked(d, edge) || isEdgeHidden(d, edge) ? 'locked' : 'ok'
}

/** Applies the fixes in a safe order. Returns the new diagram and what happened to each fix, in the order given. */
export function applyFixes(diagram: Diagram, fixes: readonly RefineFix[]): { diagram: Diagram; results: FixResult[] } {
  const status = new Map<string, FixStatus>()
  let d = diagram
  for (const fix of [...fixes].sort((a, b) => ORDER[a.action] - ORDER[b.action])) {
    const ok = check(d, fix)
    if (ok !== 'ok') {
      status.set(fix.key, ok)
      continue
    }
    let next = d
    if (fix.action === 'relabel') next = fix.target === 'node' ? ops.setNodeLabel(d, fix.id, fix.label) : ops.setEdgeLabel(d, fix.id, fix.label)
    else if (fix.action === 'reshape') {
      if (!isKnownShape(fix.shape)) {
        status.set(fix.key, 'invalid')
        continue
      }
      next = ops.changeNodeType(d, [fix.id], fix.shape, getShape(fix.shape).minSize)
    } else if (fix.action === 'redirect') {
      const edge = d.edges.find((e) => e.id === fix.id)!
      const style = redirectedStyle(edge, fix)
      if (!style) {
        status.set(fix.key, 'invalid')
        continue
      }
      const same = (edge.style.startArrow ?? ARROW_DEFAULTS.start) === style.startArrow && (edge.style.endArrow ?? ARROW_DEFAULTS.end) === style.endArrow
      if (!same) next = { ...d, edges: d.edges.map((e) => (e.id === fix.id ? { ...e, style: { ...e.style, ...style } } : e)) }
    } else next = ops.removeElements(d, [fix.id]).diagram
    status.set(fix.key, next === d ? 'unchanged' : 'applied')
    d = next
  }
  return { diagram: d, results: fixes.map((fix) => ({ fix, status: status.get(fix.key) ?? 'invalid' })) }
}
