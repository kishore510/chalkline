import { z } from 'zod'
import { plainText, stripFences } from './generated'

/*
 * Review findings, from either source: local checks (no network) or the AI
 * review. The AI's answer is never trusted: it's parsed as data, each
 * finding is checked and trimmed, and every shape id it names must be one
 * that was sent. Read-only: findings are shown, never applied.
 */

export const SEVERITIES = ['high', 'medium', 'low'] as const
export type Severity = (typeof SEVERITIES)[number]

export const SEVERITY_NAMES: Record<Severity, string> = { high: 'High', medium: 'Medium', low: 'Low' }

export interface ReviewFinding {
  /** Stable within one review, for dismissing. */
  id: string
  source: 'local' | 'ai'
  /** A local check id or an AI focus id. */
  category: string
  severity: Severity
  title: string
  explanation: string
  suggestion: string
  /** Shapes (and, for local checks, connectors) it's about. */
  shapeIds: string[]
}

/** The AI contract's caps, applied here whatever the model returned. */
export const REVIEW_CAPS = {
  findings: 10,
  title: 80,
  explanation: 300,
  suggestion: 200,
  /** The model's one-line remark on the diagram as a whole (e.g. "too small to review"). */
  note: 300,
} as const

/** Over `max` characters: cut at a word if one ends near the limit, with an ellipsis. */
export function trimTo(text: string, max: number): string {
  const chars = [...text]
  if (chars.length <= max) return text
  const cut = chars.slice(0, max - 1).join('')
  const space = cut.lastIndexOf(' ')
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`
}

const rank = (s: Severity) => SEVERITIES.indexOf(s)

/** High first, then medium, then low; the model's order within each. */
export const bySeverity = <T extends Pick<ReviewFinding, 'severity'>>(findings: readonly T[]): T[] =>
  findings
    .map((f, i) => ({ f, i }))
    .sort((a, b) => rank(a.f.severity) - rank(b.f.severity) || a.i - b.i)
    .map(({ f }) => f)

// Loose on values, strict on shape: unknown fields are stripped, odd values are fixed or dropped below.
const text = z.string().nullish()
const RawSchema = z.object({
  findings: z.array(
    z.object({
      category: text,
      severity: text,
      title: text,
      explanation: text,
      shapeIds: z.array(z.union([z.string(), z.number()])).nullish(),
      suggestion: text,
    }),
  ),
  note: text,
})

export type ReviewValidation =
  | { ok: true; findings: ReviewFinding[]; note: string; warnings: string[] }
  | { ok: false; detail: string }

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/**
 * Checks the AI's answer. `sentIds` are the ids in the payload that was
 * sent; `categories` the focus areas asked for. Unknown shape ids are
 * dropped, long text is trimmed, findings with no title or an unknown
 * category are dropped, and at most REVIEW_CAPS.findings are kept, most
 * severe first. Anything that isn't the expected JSON is malformed.
 */
export function validateReview(answer: string, sentIds: ReadonlySet<string>, categories: readonly string[]): ReviewValidation {
  let json: unknown
  try {
    json = JSON.parse(stripFences(answer))
  } catch {
    return { ok: false, detail: 'The answer wasn’t JSON.' }
  }
  const raw = RawSchema.safeParse(json)
  if (!raw.success) return { ok: false, detail: `The answer didn’t match the review format: ${raw.error.issues[0]?.message ?? 'unknown problem'}.` }

  const allowed = new Set(categories)
  let noTitle = 0
  let offTopic = 0
  let droppedIds = 0
  const kept: ReviewFinding[] = []
  raw.data.findings.forEach((f, i) => {
    const title = plainText(f.title)
    if (!title) return void noTitle++
    const category = plainText(f.category)
    if (!allowed.has(category)) return void offTopic++
    const severity = (SEVERITIES as readonly string[]).includes(plainText(f.severity).toLowerCase()) ? (plainText(f.severity).toLowerCase() as Severity) : 'low'
    const ids = [...new Set((f.shapeIds ?? []).map(String))]
    const known = ids.filter((id) => sentIds.has(id))
    droppedIds += ids.length - known.length
    kept.push({
      id: `ai:${i}`,
      source: 'ai',
      category,
      severity,
      title: trimTo(title, REVIEW_CAPS.title),
      explanation: trimTo(plainText(f.explanation), REVIEW_CAPS.explanation),
      suggestion: trimTo(plainText(f.suggestion), REVIEW_CAPS.suggestion),
      shapeIds: known,
    })
  })

  const ordered = bySeverity(kept)
  const findings = ordered.slice(0, REVIEW_CAPS.findings)
  const warnings = [
    ...(droppedIds ? [`${plural(droppedIds, 'shape reference')} didn’t match anything that was sent, so ${droppedIds === 1 ? 'it was' : 'they were'} removed.`] : []),
    ...(noTitle ? [`${plural(noTitle, 'finding')} with no title ${noTitle === 1 ? 'was' : 'were'} left out.`] : []),
    ...(offTopic ? [`${plural(offTopic, 'finding')} outside the chosen focus areas ${offTopic === 1 ? 'was' : 'were'} left out.`] : []),
    ...(ordered.length > findings.length ? [`Only the first ${REVIEW_CAPS.findings} findings are shown; ${ordered.length - findings.length} less severe ${ordered.length - findings.length === 1 ? 'one was' : 'ones were'} left out.`] : []),
  ]
  return { ok: true, findings, note: trimTo(plainText(raw.data.note), REVIEW_CAPS.note), warnings }
}
