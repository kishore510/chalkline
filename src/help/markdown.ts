/*
 * A deliberately small Markdown subset for help topics, parsed to a tree that
 * is rendered as React elements (never as HTML strings), so content can't
 * inject markup or scripts.
 *
 * Blocks: ## and ### headings, paragraphs, - and 1. lists, > tips.
 * Inline: **bold**, _italic_, `keys or code`, [links](help:topic-id) and
 * [links](https://…). Any other link target is shown as plain text.
 */

export type Inline =
  | { type: 'text'; text: string }
  | { type: 'strong'; children: Inline[] }
  | { type: 'em'; children: Inline[] }
  | { type: 'code'; text: string }
  | { type: 'link'; href: string; children: Inline[] }

export type Block =
  | { type: 'heading'; level: 2 | 3; children: Inline[] }
  | { type: 'paragraph'; children: Inline[] }
  | { type: 'list'; ordered: boolean; items: Inline[][] }
  | { type: 'tip'; children: Inline[] }

/** `help:topic-id` links open another topic; https links open in a new tab. */
export const HELP_LINK = /^help:([a-z0-9-]+)$/
const SAFE_EXTERNAL = /^https:\/\/[^\s]+$/

const INLINE = /`([^`]+)`|\*\*(.+?)\*\*|(?<![\w])_(.+?)_(?![\w])|\[([^\]]+)\]\(([^)\s]+)\)/g

export function parseInline(text: string): Inline[] {
  const out: Inline[] = []
  let last = 0
  const push = (t: string) => {
    if (!t) return
    const prev = out.at(-1)
    if (prev?.type === 'text') prev.text += t
    else out.push({ type: 'text', text: t })
  }
  for (const m of text.matchAll(INLINE)) {
    push(text.slice(last, m.index))
    last = m.index + m[0].length
    const [, code, strong, em, linkText, href] = m
    if (code !== undefined) out.push({ type: 'code', text: code })
    else if (strong !== undefined) out.push({ type: 'strong', children: parseInline(strong) })
    else if (em !== undefined) out.push({ type: 'em', children: parseInline(em) })
    else if (HELP_LINK.test(href!) || SAFE_EXTERNAL.test(href!)) out.push({ type: 'link', href: href!, children: parseInline(linkText!) })
    else push(linkText!)
  }
  push(text.slice(last))
  return out
}

const BULLET = /^[-*]\s+(.*)$/
const NUMBERED = /^\d+[.)]\s+(.*)$/

export function parseMarkdown(source: string): Block[] {
  const blocks: Block[] = []
  let paragraph: string[] = []
  let list: { ordered: boolean; items: string[] } | null = null
  let tip: string[] = []

  const flush = () => {
    if (paragraph.length) blocks.push({ type: 'paragraph', children: parseInline(paragraph.join(' ')) })
    if (list) blocks.push({ type: 'list', ordered: list.ordered, items: list.items.map(parseInline) })
    if (tip.length) blocks.push({ type: 'tip', children: parseInline(tip.join(' ')) })
    paragraph = []
    list = null
    tip = []
  }

  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) {
      flush()
      continue
    }
    const heading = /^(#{2,3})\s+(.+)$/.exec(line)
    if (heading) {
      flush()
      blocks.push({ type: 'heading', level: heading[1]!.length as 2 | 3, children: parseInline(heading[2]!) })
      continue
    }
    if (line.startsWith('>')) {
      if (!tip.length) flush()
      tip.push(line.replace(/^>\s?/, ''))
      continue
    }
    const bullet = BULLET.exec(line)
    const numbered = NUMBERED.exec(line)
    const item = bullet ?? numbered
    if (item) {
      const ordered = numbered !== null
      if (!list || list.ordered !== ordered) {
        flush()
        list = { ordered, items: [] }
      }
      list.items.push(item[1]!)
      continue
    }
    // An indented line continues the current list item.
    if (list && /^\s{2,}/.test(raw)) {
      list.items[list.items.length - 1] += ` ${line}`
      continue
    }
    if (list || tip.length) flush()
    paragraph.push(line)
  }
  flush()
  return blocks
}

/** Plain text of inline content (for search snippets). */
export function inlineText(children: Inline[]): string {
  return children.map((c) => (c.type === 'text' || c.type === 'code' ? c.text : inlineText(c.children))).join('')
}

/** Every link target in a document, for checking help links resolve. */
export function linksIn(blocks: Block[]): string[] {
  const out: string[] = []
  const walk = (children: Inline[]) => {
    for (const c of children) {
      if (c.type === 'link') out.push(c.href)
      if (c.type === 'strong' || c.type === 'em' || c.type === 'link') walk(c.children)
    }
  }
  for (const b of blocks) {
    if (b.type === 'list') b.items.forEach(walk)
    else walk(b.children)
  }
  return out
}
