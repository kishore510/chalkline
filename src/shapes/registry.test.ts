import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { floatingEndpoints } from '@/canvas/floating'
import { routeEdge } from '@/canvas/routing'
import { ShapeView } from '@/components/shapes/ShapeView'
import { buildSvg, type ExportEnv } from '@/export/svg'
import { createEmptyDiagram, NodeStyleSchema, type Size } from '@/schema/diagram'
import { createEdge, createNode } from '@/schema/factories'
import { boxContains, distanceToOutline } from './outline'
import { CATEGORIES, getShape, isKnownShape, SHAPE_IDS, SHAPES } from './registry'

// A fixed palette so exported colours are predictable.
const env: ExportEnv = {
  colour: (token) => (token.startsWith('swatch') ? '#aabbcc' : '#123456'),
  measure: (text, size) => text.length * size * 0.55,
  fontFamily: 'sans-serif',
  fontSize: 15,
  lineHeight: 1.35,
  nodePadding: 8,
  nodeStrokeWidth: 1.5,
  edgeWidth: 1.5,
  freeLabelMax: 200,
  edgeLabelFontSize: 12,
}

/** Default size, plus stretched, squashed and minimum-size variants. */
const sizesFor = (shape: (typeof SHAPES)[number]): Size[] => [
  shape.defaultSize,
  shape.minSize,
  { width: shape.defaultSize.width * 2, height: shape.defaultSize.height },
  { width: shape.defaultSize.width, height: shape.defaultSize.height * 2 },
]

describe('shape registry', () => {
  it('has unique, stable-looking ids and known categories', () => {
    expect(new Set(SHAPE_IDS).size).toBe(SHAPE_IDS.length)
    for (const id of SHAPE_IDS) expect(id).toMatch(/^[a-z][a-z0-9-]*$/)
    const categories = new Set(CATEGORIES.map((c) => c.id))
    for (const s of SHAPES) expect(categories.has(s.category)).toBe(true)
    for (const c of CATEGORIES) expect(SHAPES.some((s) => s.category === c.id)).toBe(true)
  })

  it('keeps the original six ids', () => {
    for (const id of ['rectangle', 'rounded', 'database', 'cloud', 'actor', 'text']) expect(isKnownShape(id)).toBe(true)
  })
})

describe.each(SHAPES.map((s) => [s.id, s] as const))('%s', (_id, shape) => {
  it('has a name, icon, sensible sizes and a valid default style', () => {
    expect(shape.name.length).toBeGreaterThan(0)
    expect(shape.icon).toBeTruthy()
    expect(shape.minSize.width).toBeLessThanOrEqual(shape.defaultSize.width)
    expect(shape.minSize.height).toBeLessThanOrEqual(shape.defaultSize.height)
    expect(NodeStyleSchema.safeParse(shape.defaultStyle).success).toBe(true)
    expect(shape.sides.length).toBeGreaterThan(0)
    for (const side of shape.spreadSides) expect(shape.sides).toContain(side)
  })

  it('renders, using theme tokens rather than fixed colours', () => {
    const html = renderToStaticMarkup(createElement(ShapeView, { type: shape.id, size: shape.defaultSize, label: 'Label here' }))
    expect(html).toContain('<svg')
    expect(html).toContain('Label here')
    expect(html).not.toMatch(/#[0-9a-f]{6}\b/i)
  })

  it.each(sizesFor(shape))('keeps its label area inside its bounds at $width x $height', (size) => {
    const { box } = shape.label(size)
    expect(boxContains({ x: 0, y: 0, ...size }, box)).toBe(true)
    expect(box.width).toBeGreaterThan(0)
  })

  it.each(sizesFor(shape))('has attachment points on its outline at $width x $height', (size) => {
    const outline = shape.outline(size)
    // Allow a little slack for curves that are sampled into straight segments.
    const tolerance = Math.max(1, Math.min(size.width, size.height) * 0.02)
    for (const side of shape.sides) {
      const p = shape.anchor(size, side)
      expect(distanceToOutline(p, outline)).toBeLessThanOrEqual(tolerance)
      expect(boxContains({ x: 0, y: 0, ...size }, { ...p, width: 0, height: 0 })).toBe(true)
    }
  })

  it('exports to SVG', () => {
    const node = createNode(shape.id, { x: 0, y: 0 }, { label: shape.name })
    const { svg } = buildSvg({ ...createEmptyDiagram(), nodes: [node] }, env)
    expect(svg).toContain('<g transform="translate(0 0)">')
    expect(svg).not.toContain('var(')
    if (shape.geometry(shape.defaultSize).body.length > 0) expect(svg).toContain('<path')
  })
})

describe('connectors attach at the visible outline', () => {
  const box = (type: string, x: number, y: number) => ({ x, y, ...getShape(type).defaultSize, type })

  it('diamond: at its vertices', () => {
    const ends = floatingEndpoints(box('diamond', 0, 0), box('diamond', 400, 0))
    expect([ends.sourceX, ends.sourceY]).toEqual([140, 50])
    expect([ends.targetX, ends.targetY]).toEqual([400, 50])
  })

  it('parallelogram: on the slanted side, not the box corner', () => {
    const ends = floatingEndpoints(box('rectangle', -400, 0), box('parallelogram', 0, 0))
    expect(ends.targetSide).toBe('left')
    expect(ends.targetX).toBeGreaterThan(0)
  })

  it('cloud and actor: on the artwork, inside their boxes', () => {
    for (const type of ['cloud', 'actor', 'user-group', 'document', 'callout']) {
      const shape = getShape(type)
      const size = shape.defaultSize
      const ends = floatingEndpoints(box(type, 0, 0), box('rectangle', 600, 0))
      expect(distanceToOutline({ x: ends.sourceX, y: ends.sourceY }, shape.outline(size))).toBeLessThanOrEqual(2)
    }
  })

  it('routed connectors start and end on the outline too', () => {
    const a = createNode('ellipse', { x: 0, y: 0 }, { id: 'a' })
    const b = createNode('diamond', { x: 400, y: 200 }, { id: 'b' })
    const route = routeEdge([a, b], createEdge('a', 'b', { id: 'e' }))
    const first = route.points[0]!
    const last = route.points.at(-1)!
    expect(distanceToOutline({ x: first.x - a.position.x, y: first.y - a.position.y }, getShape('ellipse').outline(a.size))).toBeLessThanOrEqual(1)
    expect(distanceToOutline({ x: last.x - b.position.x, y: last.y - b.position.y }, getShape('diamond').outline(b.size))).toBeLessThanOrEqual(0.01)
  })
})
