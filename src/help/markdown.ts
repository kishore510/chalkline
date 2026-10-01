/*
 * A deliberately small Markdown subset for help topics, parsed to a tree that
 * is rendered as React elements (never as HTML strings), so content can't
 * inject markup or scripts.
 *
 * Blocks: ## and ### headings, paragraphs, - and 1. lists, > tips, ``` code.
 * Inline: **bold**, _italic_, `keys or code`, [links](help:topic-id) and
 * [links](https://…). Any other link target is shown as plain text. Images
 * are never shown: only their alt text.
 *
 * Untrusted text (an AI answer) is stricter: no links at all (a link's text
 * is shown with its address after it, as plain text, never clickable), HTML
 * tags are removed, horizontal rules are dropped, and every heading level is
 * read (# and ## as headings, ### and deeper as subheadings).
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
  | { type: 'code'; text: string }

export interface ParseOptions {
  /** Text from outside Chalkline (an AI answer): no links, no HTML tags. */
  untrusted?: boolean
}

/** `help:topic-id` links open another topic; https links open in a new tab. */
export const HELP_LINK = /^help:([a-z0-9-]+)$/
const SAFE_EXTERNAL = /^https:\/\/[^\s]+$/

const INLINE = /`([^`]+)`|\*\*(.+?)\*\*|(?<![\w])_(.+?)_(?![\w])|!\[([^\]]*)\]\(([^)]*)\)|\[([^\]]+)\]\(([^)\s]+)\)/g

/** HTML tags and comments: removed from untrusted text (their inner text stays). */
const HTML_TAG = /<!--[\s\S]*?-->|<\/?[a-zA-Z][\w:-]*(?:\s[^<>]*)?\/?>/g

export const stripTags = (text: string) => text.replace(HTML_TAG, '')

export function parseInline(text: string, options: ParseOptions = {}): Inline[] {
  const { untrusted = false } = options
  const out: Inline[] = []
  let last = 0
  const push = (raw: string) => {
    const t = untrusted ? stripTags(raw) : raw
    if (!t) return
    const prev = out.at(-1)
    if (prev?.type === 'text') prev.text += t
    else out.push({ type: 'text', text: t })
  }
  for (const m of text.matchAll(INLINE)) {
    push(text.slice(last, m.index))
    last = m.index + m[0].length
    const [, code, strong, em, alt, , linkText, href] = m
    if (code !== undefined) out.push({ type: 'code', text: code })
    else if (strong !== undefined) out.push({ type: 'strong', children: parseInline(strong, options) })
    else if (em !== undefined) out.push({ type: 'em', children: parseInline(em, options) })
    // Images: never loaded, only their alt text.
    else if (alt !== undefined) push(alt)
    else if (untrusted) {
      // Not a link: the text, then the address as plain text so the person can see (and copy) it.
      out.push(...parseInline(linkText!, options))
      if (href !== linkText) push(` (${href})`)
    } else if (HELP_LINK.test(href!) || SAFE_EXTERNAL.test(href!)) out.push({ type: 'link', href: href!, children: parseInline(linkText!) })
    else push(linkText!)
  }
  push(text.slice(last))
  return out
}

const BULLET = /^[-*]\s+(.*)$/
const NUMBERED = /^\d+[.)]\s+(.*)$/

const FENCE = /^(```|~~~)/
const RULE = /^([-*_])(\s*\1){2,}$/

export function parseMarkdown(source: string, options: ParseOptions = {}): Block[] {
  const { untrusted = false } = options
  const inline = (text: string) => parseInline(text, options)
  const blocks: Block[] = []
  let paragraph: string[] = []
  let list: { ordered: boolean; items: string[] } | null = null
  let tip: string[] = []
  /** Lines of an open ``` block, with its fence. */
  let code: { fence: string; lines: string[] } | null = null

  const flush = () => {
    const text = paragraph.length ? inline(paragraph.join(' ')) : []
    // A line that was only an HTML tag leaves nothing to show.
    if (text.length) blocks.push({ type: 'paragraph', children: text })
    if (list) blocks.push({ type: 'list', ordered: list.ordered, items: list.items.map(inline) })
    if (tip.length) blocks.push({ type: 'tip', children: inline(tip.join(' ')) })
    paragraph = []
    list = null
    tip = []
  }

  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim()
    if (code) {
      if (line.startsWith(code.fence)) {
        blocks.push({ type: 'code', text: code.lines.join('\n') })
        code = null
      } else code.lines.push(raw)
      continue
    }
    const fence = FENCE.exec(line)
    if (fence) {
      flush()
      code = { fence: fence[1]!, lines: [] }
      continue
    }
    if (!line) {
      flush()
      continue
    }
    if (untrusted && RULE.test(line)) {
      flush()
      continue
    }
    const heading = (untrusted ? /^(#{1,6})\s+(.+?)\s*#*$/ : /^(#{2,3})\s+(.+)$/).exec(line)
    if (heading) {
      flush()
      blocks.push({ type: 'heading', level: heading[1]!.length <= 2 ? 2 : 3, children: inline(heading[2]!) })
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
  // An unclosed block runs to the end.
  if (code) blocks.push({ type: 'code', text: code.lines.join('\n') })
  return blocks
}

/** Markdown from outside Chalkline (an AI answer), parsed the strict way. */
export const parseUntrustedMarkdown = (source: string) => parseMarkdown(source, { untrusted: true })

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
    else if (b.type !== 'code') walk(b.children)
  }
  return out
}
