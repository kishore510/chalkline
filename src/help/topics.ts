import { z } from 'zod'
import { CATEGORIES, SHAPES } from '@/shapes/registry'
import { inlineText, parseMarkdown, type Block } from './markdown'

/*
 * Help topics: one Markdown file per topic in src/help/topics/, each starting
 * with a small front matter block:
 *
 *   ---
 *   title: Connectors
 *   order: 3
 *   keywords: arrow, link, line
 *   ---
 *
 * The file name (without .md) is the topic id used in `help:` links.
 */

const FrontMatter = z.object({
  title: z.string().min(1),
  order: z.number().int(),
  keywords: z.array(z.string().min(1)).min(1),
})
export type FrontMatter = z.infer<typeof FrontMatter>

export interface HelpTopic extends FrontMatter {
  id: string
  blocks: Block[]
  /** Lower-case plain text of the body, for search. */
  text: string
}

/** Splits off and validates the front matter. Throws with the reason if it's missing or invalid. */
export function parseFrontMatter(source: string): { meta: FrontMatter; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(source)
  if (!match) throw new Error('missing front matter')
  const fields: Record<string, unknown> = {}
  for (const line of match[1]!.split(/\r?\n/)) {
    if (!line.trim()) continue
    const field = /^(\w+):\s*(.*)$/.exec(line)
    if (!field) throw new Error(`bad front matter line: ${line}`)
    const [, key, value] = field as unknown as [string, string, string]
    fields[key] =
      key === 'order' ? Number(value) : key === 'keywords' ? value.split(',').map((k) => k.trim()).filter(Boolean) : value.trim()
  }
  return { meta: FrontMatter.parse(fields), body: match[2]! }
}

/** Replaced in a topic body by the generated list of shapes. */
export const SHAPE_REFERENCE_MARKER = '{{shape-reference}}'

/** Every shape in the registry, by palette category, as Markdown. New shapes appear automatically. */
export function shapeReferenceMarkdown(): string {
  return CATEGORIES.map((category) => {
    const shapes = SHAPES.filter((s) => s.category === category.id)
    if (shapes.length === 0) return ''
    const items = shapes.map((s) => {
      const size = `${s.defaultSize.width} × ${s.defaultSize.height}`
      const label = s.defaultLabel ? `starts as “${s.defaultLabel}”` : 'starts with no label'
      return `- **${s.name}**: ${s.description}; ${label}, ${size}${s.keepAspect ? ', keeps its proportions when resized' : ''}.`
    })
    return `### ${category.name}\n\n${items.join('\n')}`
  })
    .filter(Boolean)
    .join('\n\n')
}

const blockText = (b: Block) => (b.type === 'list' ? b.items.map(inlineText).join(' ') : inlineText(b.children))

/** Builds topics from `{ path: raw markdown }`, sorted by `order`. */
export function buildTopics(files: Record<string, string>): HelpTopic[] {
  return Object.entries(files)
    .map(([path, raw]) => {
      const id = path.split('/').at(-1)!.replace(/\.md$/, '')
      const { meta, body } = parseFrontMatter(raw)
      const blocks = parseMarkdown(body.replace(SHAPE_REFERENCE_MARKER, shapeReferenceMarkdown()))
      return { id, ...meta, blocks, text: blocks.map(blockText).join('\n').toLowerCase() }
    })
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title))
}

export interface SearchResult {
  topic: HelpTopic
  /** A line of the topic that mentions the search, if the match was in the body. */
  snippet?: string
}

const terms = (query: string) => query.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean)

/**
 * Topics containing every word of the query (in the title, keywords or text),
 * best first: title matches, then keywords, then body text.
 */
export function searchTopics(topics: HelpTopic[], query: string): SearchResult[] {
  const words = terms(query)
  if (words.length === 0) return []
  const scored: { result: SearchResult; score: number }[] = []
  for (const topic of topics) {
    const title = topic.title.toLowerCase()
    const keywords = topic.keywords.join(' ').toLowerCase()
    let score = 0
    let all = true
    for (const w of words) {
      const s = (title.includes(w) ? 10 : 0) + (keywords.includes(w) ? 5 : 0) + (topic.text.includes(w) ? 1 : 0)
      if (s === 0) all = false
      score += s
    }
    if (!all) continue
    const line = topic.blocks.map(blockText).find((t) => t.toLowerCase().includes(words[0]!))
    scored.push({ result: { topic, ...(line && { snippet: line.length > 140 ? `${line.slice(0, 137)}…` : line }) }, score })
  }
  return scored.sort((a, b) => b.score - a.score || a.result.topic.order - b.result.topic.order).map((s) => s.result)
}
