import { describe, expect, it } from 'vitest'
import { stencilFixtures } from '@/fixtures'
import { buildSvg } from '@/export/svg'
import { DiagramSchema, SCHEMA_VERSION, type Diagram } from '@/schema/diagram'
import { isKnownShape } from '@/shapes/registry'
import { BUILTIN_STENCILS, builtinStencilFiles, isBuiltinId, TEMPLATES, templateFiles } from './builtin'
import { parseStencil, parseStencilFile, serializeStencil } from './format'
import { placeStencil } from './fragment'
import { diagramFromTemplate, hasContent, parseTemplate } from './templates'
import { diagramThumbnail, stencilThumbnail } from './thumbnail'
import { testThumbnailEnv, themeColours, themeEnv } from './testEnv'
import { createEmptyDiagram } from '@/schema/diagram'
import { bodyBox } from '@/store/groups'

const issues = (d: Diagram) => DiagramSchema.safeParse(d).error?.issues ?? []
const THEMES = ['light', 'dark'] as const

/** Every colour in the content is a token that both themes define. */
function colourTokens(d: { nodes: { style: object }[]; edges: { style: object }[]; groups: { style: object }[] }) {
  const out: string[] = []
  for (const item of [...d.nodes, ...d.edges, ...d.groups]) {
    for (const value of Object.values(item.style)) if (typeof value === 'string' && value.startsWith('#')) out.push(`hex ${value}`)
    for (const value of Object.values(item.style)) if (typeof value === 'string' && value.startsWith('token:')) out.push(value.slice(6))
  }
  return out
}

/** Built-in layouts are tidy: members inside their group's body, no shapes overlapping. */
function checkLayout(d: Diagram) {
  for (const n of d.nodes) {
    const group = d.groups.find((g) => g.id === n.groupId)
    if (!group) continue
    const body = bodyBox(d, group)
    expect(n.position.x >= body.x && n.position.y >= body.y, `${n.label} inside ${group.label}`).toBe(true)
    expect(n.position.x + n.size.width <= body.x + body.width && n.position.y + n.size.height <= body.y + body.height, `${n.label} inside ${group.label}`).toBe(true)
  }
  d.nodes.forEach((a, i) =>
    d.nodes.slice(i + 1).forEach((b) => {
      const apart = a.position.x + a.size.width <= b.position.x || b.position.x + b.size.width <= a.position.x || a.position.y + a.size.height <= b.position.y || b.position.y + b.size.height <= a.position.y
      expect(apart, `${a.label} overlaps ${b.label}`).toBe(true)
    }),
  )
}

function checkRenders(d: Diagram) {
  checkLayout(d)
  for (const theme of THEMES) {
    const { svg, width, height } = buildSvg(d, themeEnv(theme))
    expect(width).toBeGreaterThan(0)
    expect(height).toBeGreaterThan(0)
    // Every colour resolved to a real value in this theme.
    expect(svg).not.toMatch(/(fill|stroke)=""/)
    expect(svg).not.toContain('var(')
  }
  const thumb = diagramThumbnail(d, testThumbnailEnv)
  expect(thumb).toMatch(/^<svg[^>]*width="100%"/)
  expect(thumb).not.toContain('<text')
}

const NAMED_VENDORS = /\b(aws|azure|gcp|google|amazon|microsoft|kafka|postgres|mysql|redis|kubernetes|docker|github|jenkins|oracle|ibm)\b/i

describe('built-in stencils', () => {
  it('has the seven expected stencils with unique ids', () => {
    expect(BUILTIN_STENCILS).toHaveLength(7)
    expect(new Set(BUILTIN_STENCILS.map((s) => s.id)).size).toBe(7)
    expect(BUILTIN_STENCILS.every((s) => isBuiltinId(s.id))).toBe(true)
  })

  it.each(Object.entries(builtinStencilFiles))('%s validates, renders, exports and places', (_name, raw) => {
    const s = parseStencil(raw)
    expect(s.schemaVersion).toBe(SCHEMA_VERSION)
    expect((raw as { schemaVersion: number }).schemaVersion).toBe(SCHEMA_VERSION)
    const ids = [...s.content.nodes, ...s.content.edges, ...s.content.groups].map((i) => i.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(s.content.nodes.every((n) => isKnownShape(n.type))).toBe(true)
    expect(JSON.stringify(raw)).not.toMatch(NAMED_VENDORS)
    const light = themeColours('light')
    const dark = themeColours('dark')
    for (const token of colourTokens(s.content)) {
      expect(token, 'only token colours').not.toMatch(/^hex/)
      expect(light[token], `${token} in light`).toBeDefined()
      expect(dark[token], `${token} in dark`).toBeDefined()
    }
    expect(parseStencilFile(serializeStencil(s)).stencils).toEqual([s])
    const { diagram } = placeStencil(createEmptyDiagram(), s.content, { x: 0, y: 0 }, 'default', 20)
    expect(issues(diagram)).toEqual([])
    checkRenders(diagram)
    expect(stencilThumbnail(s.content, testThumbnailEnv)).toMatch(/^<svg/)
  })
})

describe('templates', () => {
  it('has the seven expected templates with unique ids', () => {
    expect(TEMPLATES).toHaveLength(7)
    expect(new Set(TEMPLATES.map((t) => t.id)).size).toBe(7)
  })

  it.each(Object.entries(templateFiles))('%s validates, renders and starts a fresh diagram', (_name, raw) => {
    const t = parseTemplate(raw)
    expect(issues(t.diagram)).toEqual([])
    expect(t.diagram.nodes.every((n) => isKnownShape(n.type))).toBe(true)
    expect(JSON.stringify(raw)).not.toMatch(NAMED_VENDORS)
    const light = themeColours('light')
    const dark = themeColours('dark')
    for (const token of colourTokens(t.diagram)) {
      expect(token).not.toMatch(/^hex/)
      expect(light[token] && dark[token], token).toBeTruthy()
    }
    checkRenders(t.diagram)
  })

  it('the swimlane template fixture creates a new diagram with fresh ids and current timestamps', () => {
    const t = parseTemplate(stencilFixtures.template)
    const now = new Date('2026-10-02T09:00:00.000Z')
    const d = diagramFromTemplate(t, now)
    expect(issues(d)).toEqual([])
    expect(d.meta).toEqual({ title: 'Fixture swimlane', created: now.toISOString(), updated: now.toISOString() })
    const oldIds = new Set([...t.diagram.nodes, ...t.diagram.edges, ...t.diagram.groups].map((i) => i.id))
    expect([...d.nodes, ...d.edges, ...d.groups].some((i) => oldIds.has(i.id))).toBe(false)
    expect(d.nodes).toHaveLength(t.diagram.nodes.length)
    expect(d.edges).toHaveLength(t.diagram.edges.length)
    // Structure preserved: three lanes in one pool, members in lanes, the extra container kept.
    const pool = d.groups.find((g) => g.label === 'Platform')!
    expect(d.groups.filter((g) => g.kind === 'lane' && g.parentId === pool.id)).toHaveLength(3)
    const lanes = new Set(d.groups.filter((g) => g.kind === 'lane').map((g) => g.id))
    expect(d.nodes.filter((n) => n.groupId && lanes.has(n.groupId))).toHaveLength(6)
    expect(d.nodes.find((n) => n.label === 'Partner')!.groupId).toBe(d.groups.find((g) => g.label === 'External')!.id)
    expect(hasContent(d)).toBe(true)
    expect(hasContent(createEmptyDiagram())).toBe(false)
  })

  it('rejects a broken template', () => {
    expect(() => parseTemplate({ kind: 'chalkline-template', id: 'x', name: 'x', category: 'x', diagram: { schemaVersion: 4 } })).toThrow()
  })
})

describe('thumbnail colours', () => {
  it('resolve to each theme’s token values', async () => {
    const { resolveTokenColours } = await import('./thumbnail')
    const svg = stencilThumbnail(BUILTIN_STENCILS[0]!.content, testThumbnailEnv)
    expect(svg).toContain('var(--cl-')
    for (const theme of THEMES) {
      const colours = themeColours(theme)
      const resolved = resolveTokenColours(svg, (t) => colours[t] ?? '')
      expect(resolved).not.toContain('var(')
    }
  })
})
