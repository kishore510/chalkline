import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { buildSystemPrompt as refineSystemPrompt, outputSchema as refineSchema } from '@/ai/refinePrompt'
import { buildSystemPrompt, generatePlan, outputSchema, shapeCatalogue } from '@/ai/generatePrompt'
import { ShapeView } from '@/components/shapes/ShapeView'
import { minHeightForLabel } from '@/components/shapes/geometry'
import { searchShapes } from '@/editor/paletteModel'
import { buildSvg, type ExportEnv } from '@/export/svg'
import { fixtures, legacyFixtures } from '@/fixtures'
import { createEmptyDiagram, DiagramSchema, migrate, type Size } from '@/schema/diagram'
import { createNode } from '@/schema/factories'
import { diagramThumbnail } from '@/stencils/thumbnail'
import { outlineIcon, outlineIconPaths, outlinePaths } from './glyphIcon'
import { boxSidePoint, distanceToOutline } from './outline'
import { CATEGORIES, getShape, isKnownShape, SHAPE_IDS, SHAPES } from './registry'
import type { Point, ShapeDefinition, Side } from './types'

/* Shapes pack 4: basic geometry, more flowchart shapes, and arrows. */

const PACK: Record<string, string[]> = {
  basic: ['square', 'circle', 'triangle', 'trapezoid', 'cube'],
  process: ['predefined-process', 'internal-storage', 'delay', 'display', 'tape', 'card', 'step'],
  arrows: ['block-arrow', 'double-arrow'],
}
const IDS = Object.values(PACK).flat()
const shapes = IDS.map((id) => [id, getShape(id)] as const)

const env: ExportEnv = {
  colour: () => '#123456',
  measure: (text, size) => text.length * size * 0.55,
  fontSize: 15,
  lineHeight: 1.35,
  nodePadding: 8,
  nodeStrokeWidth: 1.5,
  edgeWidth: 1.5,
  freeLabelMax: 200,
  edgeLabelFontSize: 12,
}

/** A path's commands with the numbers taken out: the same outline drawn at any size gives the same skeleton. */
const skeleton = (d: string) => d.replace(/-?\d+(\.\d+)?/g, '#')

const found = (query: string) => searchShapes(query).map((s) => s.id)

/** Default, minimum, wide, tall and a resized-narrow size. */
const sizesFor = (s: ShapeDefinition): Size[] => [
  s.defaultSize,
  s.minSize,
  { width: s.defaultSize.width * 2, height: s.defaultSize.height },
  { width: s.defaultSize.width, height: s.defaultSize.height * 2.5 },
  { width: s.minSize.width, height: s.defaultSize.height * 3 },
]

/** Even-odd test: is the point inside the polygon? */
function inside(p: Point, polygon: readonly Point[]): boolean {
  let hit = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!
    const b = polygon[j]!
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) hit = !hit
  }
  return hit
}

/** Inside the outline, or on it (curves are sampled into chords, so allow a pixel). */
const withinOutline = (p: Point, outline: readonly Point[]) => inside(p, outline) || distanceToOutline(p, outline) <= 1

describe('shapes pack 4', () => {
  it('adds each shape once, in its category, with a new Arrows category', () => {
    expect(new Set(SHAPE_IDS).size).toBe(SHAPE_IDS.length)
    for (const [category, ids] of Object.entries(PACK)) for (const id of ids) expect(getShape(id).category, id).toBe(category)
    for (const id of IDS) expect(isKnownShape(id), id).toBe(true)
    expect(CATEGORIES.find((c) => c.id === 'arrows')?.name).toBe('Arrows')
    expect(SHAPES).toHaveLength(38 + IDS.length)
  })

  it('names, descriptions and default labels are unique; descriptions are one lower-case phrase', () => {
    for (const key of ['name', 'description'] as const) {
      const values = SHAPES.map((s) => s[key].toLowerCase())
      expect(new Set(values).size, key).toBe(values.length)
    }
    for (const [id, s] of shapes) {
      expect(s.description, id).toMatch(/^[a-z]/)
      expect(s.description, id).not.toMatch(/[.!?]$/)
      expect(s.description.length, id).toBeGreaterThan(30)
      expect(s.defaultLabel.length, id).toBeGreaterThan(0)
    }
  })

  it('new search words belong to one shape only', () => {
    const owners = new Map<string, string[]>()
    for (const s of SHAPES) for (const k of s.keywords) owners.set(k, [...(owners.get(k) ?? []), s.id])
    for (const [id, s] of shapes) {
      expect(s.keywords.length, id).toBeGreaterThanOrEqual(3)
      for (const k of s.keywords) expect(owners.get(k), `${id}: ${k}`).toEqual([id])
    }
  })

  it('tells Square from Rectangle and Circle from Ellipse', () => {
    expect(getShape('square').description).toMatch(/equal sides/)
    expect(getShape('rectangle').description).not.toMatch(/equal|square/)
    expect(getShape('circle').description).toMatch(/perfectly round/)
    expect(getShape('ellipse').description).not.toMatch(/round|circle/)
    expect(getShape('square').keepAspect).toBe(true)
    expect(getShape('circle').keepAspect).toBe(true)
    expect(found('square')).toEqual(['square'])
    expect(found('circle')).toEqual(['circle'])
  })

  it.each(IDS.flatMap((id) => [...getShape(id).keywords, getShape(id).name].map((k) => [k, id])))('search "%s" finds %s', (query, id) => {
    expect(found(query)).toContain(id)
  })

  it('old saved diagrams at every schema version still load', () => {
    const raws = [...Object.values(fixtures), ...Object.values(legacyFixtures)]
    const versions = new Set(raws.map((r) => (r as { schemaVersion?: number }).schemaVersion))
    expect([...versions].sort()).toEqual([1, 2, 3, 4, 5])
    for (const raw of raws) expect(DiagramSchema.safeParse(migrate(raw)).success).toBe(true)
  })
})

describe.each(shapes)('%s', (_id, shape) => {
  it('takes its palette icon from its own outline, drawn as on the canvas', () => {
    expect(shape.glyph).toBeUndefined()
    expect(shape.icon).toBe(outlineIcon(shape.geometry, shape.defaultSize))
    const markup = renderToStaticMarkup(createElement(shape.icon))
    const icon = [...markup.matchAll(/<path d="([^"]+)"/g)].map((m) => m[1]!)
    expect(icon).toEqual(outlineIconPaths(shape.geometry, shape.defaultSize))
    // Path for path, the same drawing as the canvas, only at icon proportions.
    expect(icon.map(skeleton)).toEqual(outlinePaths(shape.geometry, shape.defaultSize).map(skeleton))
  })

  it('the canvas, SVG export and stencil thumbnail draw the same outline', () => {
    const paths = outlinePaths(shape.geometry, shape.defaultSize)
    const canvas = renderToStaticMarkup(createElement(ShapeView, { type: shape.id, size: shape.defaultSize, label: shape.defaultLabel }))
    const diagram = { ...createEmptyDiagram(), nodes: [createNode(shape.id, { x: 0, y: 0 })] }
    const exported = buildSvg(diagram, env).svg
    const thumbnail = diagramThumbnail(diagram, env)
    expect(paths.length).toBeGreaterThan(0)
    for (const d of paths) {
      expect(canvas).toContain(`d="${d}"`)
      expect(exported).toContain(`d="${d}"`)
      expect(thumbnail).toContain(`d="${d}"`)
    }
  })

  it.each(sizesFor(shape))('keeps its label area inside the visible outline at $width x $height', (size) => {
    const { box, fit } = shape.label(size)
    expect(fit).toBe('contain')
    expect(box.width).toBeGreaterThan(0)
    expect(box.height).toBeGreaterThan(0)
    const outline = shape.outline(size)
    const corners = [
      { x: box.x, y: box.y },
      { x: box.x + box.width, y: box.y },
      { x: box.x + box.width, y: box.y + box.height },
      { x: box.x, y: box.y + box.height },
      { x: box.x + box.width / 2, y: box.y + box.height / 2 },
    ]
    for (const c of corners) expect(withinOutline(c, outline), `${c.x},${c.y}`).toBe(true)
  })

  it('fits its default label on one line at the default size', () => {
    const { box } = shape.label(shape.defaultSize)
    expect(env.measure(shape.defaultLabel, env.fontSize) + 2 * env.nodePadding).toBeLessThanOrEqual(box.width)
    expect(env.fontSize * env.lineHeight + 2 * env.nodePadding).toBeLessThanOrEqual(box.height)
  })

  it('grows rather than clips: a taller label gets a taller node whose label area holds it', () => {
    for (const width of [shape.defaultSize.width, shape.minSize.width]) {
      for (const content of [40, 120, 400]) {
        const height = minHeightForLabel(shape.id, width, content)
        expect(shape.label({ width, height }).box.height).toBeGreaterThanOrEqual(content)
        // The label area only gets taller as the node does.
        expect(shape.label({ width, height: height + 50 }).box.height).toBeGreaterThanOrEqual(shape.label({ width, height }).box.height)
      }
    }
  })

  it.each(sizesFor(shape))('docks connectors on the outline at $width x $height', (size) => {
    const outline = shape.outline(size)
    const curved = ['circle', 'delay', 'display', 'tape'].includes(shape.id)
    for (const side of shape.sides) expect(distanceToOutline(shape.anchor(size, side), outline), side).toBeLessThanOrEqual(curved ? 0.5 : 0.01)
  })

  it('spreads connectors only along sides that are flat edge to edge', () => {
    const size = shape.defaultSize
    const outline = shape.outline(size)
    for (const side of shape.spreadSides) {
      const mid = boxSidePoint(size.width, size.height, side)
      const along = side === 'top' || side === 'bottom' ? { x: 1, y: 0 } : { x: 0, y: 1 }
      const half = (along.x ? size.width : size.height) * 0.45
      for (const t of [-half, half]) expect(distanceToOutline({ x: mid.x + along.x * t, y: mid.y + along.y * t }, outline), side).toBeLessThanOrEqual(0.01)
    }
  })

  it('is in the AI shape list, with its description', () => {
    expect(shapeCatalogue()).toContain(`- ${shape.id}: ${shape.name}. ${shape.description}.`)
  })
})

describe('docking where the bounding box is empty', () => {
  const at = (id: string, side: Side) => getShape(id).anchor(getShape(id).defaultSize, side)
  const box = (id: string, side: Side) => boxSidePoint(getShape(id).defaultSize.width, getShape(id).defaultSize.height, side)

  it('triangle: apex on top, slanted sides left and right', () => {
    const { width: w, height: h } = getShape('triangle').defaultSize
    expect(at('triangle', 'top')).toEqual({ x: w / 2, y: 0 })
    expect(at('triangle', 'left')).toEqual({ x: w / 4, y: h / 2 })
    expect(at('triangle', 'right')).toEqual({ x: (3 * w) / 4, y: h / 2 })
    expect(at('triangle', 'bottom')).toEqual(box('triangle', 'bottom'))
  })

  it('cube: every side lands on the drawn box, not an empty corner', () => {
    const shape = getShape('cube')
    const outline = shape.outline(shape.defaultSize)
    for (const side of shape.sides) expect(distanceToOutline(at('cube', side), outline)).toBeLessThanOrEqual(0.01)
  })

  it('step: left docks in the notch, right at the point', () => {
    const { width: w, height: h } = getShape('step').defaultSize
    expect(at('step', 'left').x).toBeGreaterThan(0)
    expect(at('step', 'left').y).toBe(h / 2)
    expect(at('step', 'right')).toEqual({ x: w, y: h / 2 })
  })

  it.each(['block-arrow', 'double-arrow'])('%s: top and bottom dock on the shaft, not the box edge', (id) => {
    expect(at(id, 'top').y).toBeGreaterThan(0)
    expect(at(id, 'bottom').y).toBeLessThan(getShape(id).defaultSize.height)
    expect(at(id, 'right')).toEqual(box(id, 'right'))
  })
})

describe('AI prompts read the live registry', () => {
  it('generate and refine offer the new shapes and accept them in the answer', () => {
    for (const prompt of [buildSystemPrompt(false), refineSystemPrompt(false)]) for (const id of IDS) expect(prompt).toContain(`- ${id}: `)
    for (const schema of [outputSchema(false), refineSchema(false)]) {
      const json = JSON.stringify(schema)
      for (const id of IDS) expect(json).toContain(`"${id}"`)
    }
  })

  it('the size estimate counts the longer shape list', () => {
    const plan = generatePlan('A queue and two workers', false)
    expect(plan.size.characters).toBeGreaterThan(buildSystemPrompt(false).length)
    expect(plan.size.characters).toBeGreaterThan(shapeCatalogue().length)
    expect(plan.size.tokens).toBeGreaterThan(0)
  })
})
