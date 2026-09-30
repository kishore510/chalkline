import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { SHAPES } from '@/shapes/registry'
import { HELP_TOPICS, topicById } from './content'
import { HELP_AREAS, LEARN_MORE } from './links'
import { HELP_LINK, inlineText, linksIn } from './markdown'
import { parseFrontMatter, searchTopics, shapeReferenceMarkdown } from './topics'

const dir = new URL('./topics/', import.meta.url)

describe('help topic files', () => {
  const files = readdirSync(dir).filter((f) => f.endsWith('.md'))

  it('are all loaded', () => {
    expect(HELP_TOPICS.map((t) => t.id).sort()).toEqual(files.map((f) => f.replace(/\.md$/, '')).sort())
  })

  it.each(files)('%s has valid front matter and a body', (file) => {
    const { meta, body } = parseFrontMatter(readFileSync(new URL(file, dir), 'utf8'))
    expect(meta.title.length).toBeGreaterThan(0)
    expect(meta.keywords.length).toBeGreaterThan(0)
    expect(body.trim().length).toBeGreaterThan(0)
  })

  it('have unique orders and ids made of lower-case words', () => {
    const orders = HELP_TOPICS.map((t) => t.order)
    expect(new Set(orders).size).toBe(orders.length)
    for (const t of HELP_TOPICS) expect(t.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  })

  it('rejects missing or invalid front matter', () => {
    expect(() => parseFrontMatter('# No front matter')).toThrow()
    expect(() => parseFrontMatter('---\ntitle: X\n---\nBody')).toThrow()
    expect(() => parseFrontMatter('---\ntitle: X\norder: first\nkeywords: a\n---\nBody')).toThrow()
    expect(parseFrontMatter('---\ntitle: X\norder: 2\nkeywords: a, b c\n---\nBody').meta).toEqual({ title: 'X', order: 2, keywords: ['a', 'b c'] })
  })
})

describe('help links', () => {
  it('every help: link in a topic points to an existing topic', () => {
    for (const topic of HELP_TOPICS) {
      for (const href of linksIn(topic.blocks)) {
        const id = HELP_LINK.exec(href)?.[1]
        if (id) expect(topicById(id), `${topic.id} links to ${href}`).toBeDefined()
      }
    }
  })

  it('every "Learn more" entry point and help area resolves', () => {
    for (const id of [...Object.values(LEARN_MORE), ...Object.values(HELP_AREAS)]) expect(topicById(id), id).toBeDefined()
  })
})

describe('shapes reference', () => {
  it('lists every shape in the registry', () => {
    const topic = topicById('shapes-reference')!
    const listed = topic.blocks.flatMap((b) => (b.type === 'list' ? b.items.map(inlineText) : []))
    for (const shape of SHAPES) expect(listed.some((line) => line.startsWith(`${shape.name}:`)), shape.name).toBe(true)
    expect(shapeReferenceMarkdown().match(/^- /gm)).toHaveLength(SHAPES.length)
  })
})

describe('searchTopics', () => {
  const top = (query: string) => searchTopics(HELP_TOPICS, query)[0]?.topic.id
  const ids = (query: string) => searchTopics(HELP_TOPICS, query).map((r) => r.topic.id)

  it('finds the expected topic first', () => {
    expect(top('arrowhead')).toBe('connectors')
    expect(top('pdf')).toBe('saving-and-exporting')
    expect(top('swimlane')).toBe('groups-and-swimlanes')
    expect(top('undo')).toBe('undo-and-autosave')
    expect(top('distribute')).toBe('align-and-distribute')
    expect(top('pinch')).toBe('gestures-and-shortcuts')
    expect(top('lock')).toBe('locking')
    expect(top('auto-arrange')).toBe('tidy-and-arrange')
  })

  it('finds shapes from the generated reference', () => {
    expect(ids('hexagon')).toContain('shapes-reference')
  })

  it('needs every word to match, ignores case and punctuation', () => {
    expect(ids('EXPORT png')).toContain('saving-and-exporting')
    expect(ids('export zebra')).toEqual([])
    expect(ids('  ')).toEqual([])
  })

  it('gives a snippet for body matches', () => {
    const result = searchTopics(HELP_TOPICS, 'docking').find((r) => r.topic.id === 'connectors')
    expect(result?.snippet?.toLowerCase()).toContain('docking')
  })
})
