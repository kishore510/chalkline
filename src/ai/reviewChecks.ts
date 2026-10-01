import type { Diagram, DiagramNode } from '@/schema/diagram'
import { getShape, isKnownShape } from '@/shapes/registry'
import { isEdgeHidden, isNodeHidden } from '@/store/layers'
import type { ReviewFinding } from './reviewFindings'

/*
 * Review's local checks: pure functions over the diagram as it is, with
 * shapes and connectors on hidden layers left out. No network, no AI, free
 * and instant. Conservative on purpose: a check that cries wolf teaches
 * people to ignore the list, so each one has guards against false positives.
 */

export type LocalCheckId = 'unconnected' | 'unlabelled-connectors' | 'duplicate-labels' | 'naming' | 'default-labels'

export interface LocalCheckOptions {
  /** Connectors without a label (informational; off unless asked for). */
  unlabelledConnectors: boolean
}

export const DEFAULT_LOCAL_OPTIONS: LocalCheckOptions = { unlabelledConnectors: false }

/** Annotation shapes (text, sticky note, callout) explain the diagram: they aren't parts of the system. */
export const isAnnotation = (node: DiagramNode) => isKnownShape(node.type) && getShape(node.type).category === 'annotation'

/** A label as written, trimmed and with runs of white space as one space. */
const tidy = (label: string) => label.trim().replace(/\s+/g, ' ')

/** "Orders DB", "Users", "Cache" and 3 more */
export function listLabels(labels: readonly string[], max = 5): string {
  const quoted = labels.map((l) => `“${l}”`)
  if (quoted.length <= max) return joinAnd(quoted)
  return `${quoted.slice(0, max).join(', ')} and ${quoted.length - max} more`
}

function joinAnd(items: readonly string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/**
 * The key two labels share when they are the same name written differently:
 * case, accents, trailing punctuation, spaces, hyphens and underscores
 * between words, and British or American -ise / -ize spellings. Nothing
 * else: plurals, abbreviations and synonyms are often deliberate.
 */
export function namingKey(label: string): string {
  return tidy(label)
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[.,;:!?…]+$/u, '')
    .split(/[\s\-_]+/)
    .map((word) => word.replace(/isation(s?)$/, 'ization$1').replace(/is(e|es|ed|er|ers|ing)$/, 'iz$1'))
    .join('')
}

/** Visible shapes, in diagram order. */
const visibleNodes = (d: Diagram) => d.nodes.filter((n) => !isNodeHidden(d, n))

/** Shapes with no connector to or from them. Annotation shapes are left out. */
export function unconnectedShapes(d: Diagram): ReviewFinding | null {
  const candidates = visibleNodes(d).filter((n) => !isAnnotation(n))
  // One shape on its own isn't a disconnected part of anything.
  if (candidates.length < 2) return null
  // Any connector counts, even one to a shape on a hidden layer: the shape is connected, just not to something shown.
  const ends = new Set(d.edges.flatMap((e) => [e.source, e.target]))
  const loose = candidates.filter((n) => !ends.has(n.id))
  if (loose.length === 0) return null
  return {
    id: 'local:unconnected',
    source: 'local',
    category: 'unconnected',
    severity: 'low',
    title: loose.length === 1 ? 'A shape has no connections' : `${loose.length} shapes have no connections`,
    explanation: `${listLabels(loose.map(labelOf))} ${loose.length === 1 ? 'isn’t' : 'aren’t'} connected to anything. Text, sticky notes and callouts aren’t counted.`,
    suggestion: 'Connect them to what they work with, or remove them if they’re left over.',
    shapeIds: loose.map((n) => n.id),
  }
}

/** Connectors without a label. Informational: plenty of good diagrams leave obvious links unlabelled. */
export function unlabelledConnectors(d: Diagram): ReviewFinding | null {
  const edges = d.edges.filter((e) => !isEdgeHidden(d, e) && !tidy(e.label ?? ''))
  if (edges.length === 0) return null
  return {
    id: 'local:unlabelled-connectors',
    source: 'local',
    category: 'unlabelled-connectors',
    severity: 'low',
    title: edges.length === 1 ? 'A connector has no label' : `${edges.length} connectors have no label`,
    explanation: `Labels say what flows or happens along a connector, such as “sends order” or “reads”. ${plural(edges.length, 'connector')} here ${edges.length === 1 ? 'has' : 'have'} none.`,
    suggestion: 'Label the ones where what flows isn’t obvious.',
    shapeIds: edges.map((e) => e.id),
  }
}

/** Labelled, visible shapes that are parts of the system (not annotations). */
const namedShapes = (d: Diagram) => visibleNodes(d).filter((n) => !isAnnotation(n) && tidy(n.label))

/** Different shapes with exactly the same label. */
export function duplicateLabels(d: Diagram): ReviewFinding[] {
  const byLabel = new Map<string, DiagramNode[]>()
  for (const n of namedShapes(d)) {
    const label = tidy(n.label)
    byLabel.set(label, [...(byLabel.get(label) ?? []), n])
  }
  return [...byLabel]
    .filter(([, nodes]) => nodes.length > 1)
    .map(([label, nodes]) => ({
      id: `local:duplicate:${label}`,
      source: 'local' as const,
      category: 'duplicate-labels',
      severity: 'low' as const,
      title: `${nodes.length} shapes are labelled “${label}”`,
      explanation: 'When different shapes share a name, readers can’t tell whether they’re the same thing drawn twice or different things.',
      suggestion: 'If they’re the same thing, keep one and connect to it. If not, give each a name that tells them apart.',
      shapeIds: nodes.map((n) => n.id),
    }))
}

/** The same name written in different ways ("API gateway", "API Gateway", "API-Gateway."). */
export function namingInconsistencies(d: Diagram): ReviewFinding[] {
  const byKey = new Map<string, DiagramNode[]>()
  for (const n of namedShapes(d)) {
    const key = namingKey(n.label)
    // Too short to judge (single letters, numbers).
    if (key.length < 2) continue
    byKey.set(key, [...(byKey.get(key) ?? []), n])
  }
  return [...byKey]
    .map(([key, nodes]) => ({ key, nodes, spellings: [...new Set(nodes.map((n) => tidy(n.label)))] }))
    .filter(({ spellings }) => spellings.length > 1)
    .map(({ key, nodes, spellings }) => ({
      id: `local:naming:${key}`,
      source: 'local' as const,
      category: 'naming',
      severity: 'low' as const,
      title: `“${spellings[0]}” is written ${spellings.length} ways`,
      explanation: `${listLabels(spellings)} look like the same name with different capitals, spacing, punctuation or spelling.`,
      suggestion: 'If they mean the same thing, write them the same way. If not, make the difference clearer.',
      shapeIds: nodes.map((n) => n.id),
    }))
}

/** Shapes with no label, or still with the label they were added with ("Service", "Database"). */
export function defaultLabels(d: Diagram): ReviewFinding | null {
  const empty: DiagramNode[] = []
  const unchanged: DiagramNode[] = []
  for (const n of visibleNodes(d)) {
    const label = tidy(n.label)
    if (!label) {
      // An empty text box is just an empty text box; other shapes need a name.
      if (n.type !== 'text') empty.push(n)
    } else if (isKnownShape(n.type) && label.toLowerCase() === getShape(n.type).defaultLabel.toLowerCase()) {
      unchanged.push(n)
    }
  }
  const all = [...empty, ...unchanged]
  if (all.length === 0) return null
  const parts = [
    ...(empty.length ? [`${plural(empty.length, 'shape')} ${empty.length === 1 ? 'has' : 'have'} no label`] : []),
    ...(unchanged.length ? [`${listLabels(unchanged.map(labelOf))} still ${unchanged.length === 1 ? 'has its' : 'have their'} starting label`] : []),
  ]
  return {
    id: 'local:default-labels',
    source: 'local',
    category: 'default-labels',
    severity: 'low',
    title: all.length === 1 ? 'A shape has an empty or starting label' : `${all.length} shapes have empty or starting labels`,
    explanation: `${joinAnd(parts)}. A specific name (“Orders DB” rather than “Database”) says what each part is.`,
    suggestion: 'Name each shape for what it is in this system.',
    shapeIds: all.map((n) => n.id),
  }
}

/** What a shape is called in a finding: its label, or its kind when it has none. */
export function labelOf(node: Pick<DiagramNode, 'label' | 'type'>): string {
  return tidy(node.label) || `unlabelled ${isKnownShape(node.type) ? getShape(node.type).name.toLowerCase() : 'shape'}`
}

/** Every local check, in a fixed order. */
export function runLocalChecks(d: Diagram, options: LocalCheckOptions = DEFAULT_LOCAL_OPTIONS): ReviewFinding[] {
  return [
    unconnectedShapes(d),
    ...duplicateLabels(d),
    ...namingInconsistencies(d),
    defaultLabels(d),
    ...(options.unlabelledConnectors ? [unlabelledConnectors(d)] : []),
  ].filter((f): f is ReviewFinding => f !== null)
}
