import { fileNameFor } from '@/persistence/serialize'
import type { Diagram } from '@/schema/diagram'
import type { AiModel } from './models'
import { labelOf } from './reviewChecks'
import { bySeverity, SEVERITY_NAMES, type ReviewFinding } from './reviewFindings'

/*
 * A review as Markdown, for Copy all and Download .md, and the names shown
 * for the shapes a finding is about. Shapes are named by their labels (ids
 * mean nothing to a reader). No network: loads with the sheet.
 */

export const ACCURACY_NOTE = 'AI review can be wrong or miss things. Treat it as a prompt for thought, not an audit.'

export interface ReviewExport {
  title: string
  local?: { findings: readonly ReviewFinding[]; diagram: Diagram }
  ai?: { findings: readonly ReviewFinding[]; diagram: Diagram; model: AiModel; scope: string; note: string }
}

/** Names for ids, from the diagram the findings are about. */
export function namer(d: Diagram) {
  const nodes = new Map(d.nodes.map((n) => [n.id, labelOf(n)]))
  const groups = new Map(d.groups.map((g) => [g.id, g.label.trim() || 'unlabelled group']))
  const edges = new Map(d.edges.map((e) => [e.id, e]))
  const name = (id: string): string => {
    const edge = edges.get(id)
    if (edge) return `connector ${name(edge.source)} → ${name(edge.target)}`
    return nodes.get(id) ?? groups.get(id) ?? id
  }
  return name
}

/** One line of Markdown: no line breaks, and nothing that would start a heading or list. */
const line = (text: string) => text.replace(/\s+/g, ' ').trim()

function findingMarkdown(f: ReviewFinding, name: (id: string) => string): string {
  const parts = [`- **${SEVERITY_NAMES[f.severity]}: ${line(f.title)}**`]
  if (f.explanation) parts.push(`  ${line(f.explanation)}`)
  if (f.suggestion) parts.push(`  Suggestion: ${line(f.suggestion)}`)
  if (f.shapeIds.length) parts.push(`  Shapes: ${f.shapeIds.map(name).map(line).join(', ')}`)
  return parts.join('\n')
}

/** The findings shown (dismissed ones left out), as a Markdown document. */
export function reviewMarkdown(review: ReviewExport): string {
  const out = [`# Review: ${line(review.title) || 'Untitled diagram'}`]
  if (review.local) {
    const name = namer(review.local.diagram)
    out.push('## Checked locally (nothing sent)')
    out.push(review.local.findings.length ? review.local.findings.map((f) => findingMarkdown(f, name)).join('\n') : 'No problems found.')
  }
  if (review.ai) {
    const name = namer(review.ai.diagram)
    out.push(`## AI review (${review.ai.model.name}, ${review.ai.scope.toLowerCase()})`)
    out.push(`_${ACCURACY_NOTE}_`)
    if (review.ai.note) out.push(line(review.ai.note))
    out.push(review.ai.findings.length ? bySeverity(review.ai.findings).map((f) => findingMarkdown(f, name)).join('\n') : 'No findings.')
  }
  return `${out.join('\n\n')}\n`
}

/** "web-architecture-review.md" */
export const reviewFileName = (title: string) => fileNameFor(title, 'md').replace(/\.md$/, '-review.md')
