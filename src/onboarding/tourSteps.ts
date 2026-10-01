import { inlineText, parseMarkdown, type Block } from '@/help/markdown'
import type { Tool } from '@/store/uiStore'

/*
 * The tour's words come from the Quick start help topic ("The three modes"),
 * so the tour and Help never disagree. Pure: parses the Markdown it's given.
 */

export interface TourStep {
  /** The mode it points at; 'modes' is the whole switch. */
  target: Tool | 'modes'
  title: string
  body: string
  /** Keyboard shortcut for the mode, if any. */
  shortcut?: string
}

export const TOUR_SECTION = 'The three modes'
const MODES: Tool[] = ['select', 'pan', 'link']

const body = (source: string) => source.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')

/** The section's blocks, between its heading and the next heading. */
function section(blocks: Block[], title: string): Block[] {
  const start = blocks.findIndex((b) => b.type === 'heading' && inlineText(b.children).trim() === title)
  if (start === -1) return []
  const end = blocks.findIndex((b, i) => i > start && b.type === 'heading')
  return blocks.slice(start + 1, end === -1 ? undefined : end)
}

/**
 * Four steps: the mode switch, then Select, Pan and Link. Returns [] if the
 * topic no longer has the section in the expected shape (a test guards this).
 */
export function tourSteps(quickStartSource: string): TourStep[] {
  const blocks = section(parseMarkdown(body(quickStartSource)), TOUR_SECTION)
  const intro = blocks.find((b) => b.type === 'paragraph')
  const list = blocks.find((b) => b.type === 'list')
  if (!intro || intro.type !== 'paragraph' || !list || list.type !== 'list') return []
  const steps: TourStep[] = [{ target: 'modes', title: TOUR_SECTION, body: inlineText(intro.children).trim() }]
  for (const item of list.items) {
    // "**Select** (`V`): tap to select, …"
    const match = /^(\w+)\s*\((\w)\):\s*(.+)$/.exec(inlineText(item).trim())
    const mode = match?.[1]?.toLowerCase() as Tool | undefined
    if (!match || !mode || !MODES.includes(mode)) continue
    const text = match[3]!
    steps.push({ target: mode, title: `${match[1]} mode`, body: text.charAt(0).toUpperCase() + text.slice(1), shortcut: match[2]!.toUpperCase() })
  }
  return steps.length === 1 + MODES.length ? steps : []
}
