import { createElement } from 'react'
import { Plug, ServerCog, Wrench } from 'lucide-react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ShapeView } from '@/components/shapes/ShapeView'
import { buildSvg, type ExportEnv } from '@/export/svg'
import { createEmptyDiagram } from '@/schema/diagram'
import { createNode } from '@/schema/factories'
import { diagramThumbnail } from '@/stencils/thumbnail'
import { glyphIcon, iconPaths, outlineIcon, outlineIconPaths, outlinePaths } from './glyphIcon'
import { LUCIDE } from './lucideGlyph'
import { SHAPES } from './registry'

/*
 * The palette icon and the mark drawn on the canvas come from one place: a
 * shape's glyph. These tests stop a second, hand-picked icon creeping back.
 */

/** A path's commands with the numbers taken out: the same glyph drawn at any size or place gives the same skeleton. */
const skeleton = (d: string) => d.replace(/-?\d+(\.\d+)?/g, '#')

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

const withGlyph = SHAPES.filter((s) => s.glyph)
const withoutGlyph = SHAPES.filter((s) => !s.glyph)
/** Shapes (pack 4 on) whose palette icon is drawn from their own outline rather than taken from Lucide. */
const drawnOutline = withoutGlyph.filter((s) => s.icon === outlineIcon(s.geometry, s.defaultSize))
const lucideOutline = withoutGlyph.filter((s) => !drawnOutline.includes(s))

describe('shape icons', () => {
  it('covers the glyph shapes', () => {
    const ids = ['firewall', 'router', 'load-balancer', 'api-gateway', 'cdn', 'cache', 'microservice', 'worker', 'ai-gateway', 'ai-guardrails', 'llm', 'vector-db', 'embeddings', 'semantic-cache', 'ai-agent', 'agent-identity', 'prompt-template', 'mcp-client', 'mcp-server', 'tool']
    expect(withGlyph.map((s) => s.id).sort()).toEqual(ids.sort())
  })

  it.each(withGlyph.map((s) => [s.id, s] as const))('%s: the palette icon is the canvas glyph', (_id, shape) => {
    const glyph = shape.glyph!
    // Same component, generated from the same glyph the canvas draws.
    expect(shape.icon).toBe(glyphIcon(glyph))

    const markup = renderToStaticMarkup(createElement(shape.icon))
    const icon = [...markup.matchAll(/<path d="([^"]+)"/g)].map((m) => m[1]!)
    expect(icon).toEqual(iconPaths(glyph))

    // The canvas draws the glyph last in the detail paths; it matches the icon path for path.
    const { detail } = shape.geometry(shape.defaultSize)
    const canvas = detail.slice(-icon.length)
    expect(canvas.map(skeleton)).toEqual(icon.map(skeleton))
  })

  it('every glyph is distinct, so no two shapes share an icon by accident', () => {
    const drawn = withGlyph.map((s) => iconPaths(s.glyph!).join(' '))
    expect(new Set(drawn).size).toBe(drawn.length)
  })

  it.each(withGlyph.map((s) => [s.id, s] as const))('%s: the canvas, SVG export and stencil thumbnails draw the same glyph', (_id, shape) => {
    const { detail } = shape.geometry(shape.defaultSize)
    const glyph = detail.slice(-iconPaths(shape.glyph!).length)
    const canvas = renderToStaticMarkup(createElement(ShapeView, { type: shape.id, size: shape.defaultSize, label: shape.defaultLabel }))
    const diagram = { ...createEmptyDiagram(), nodes: [createNode(shape.id, { x: 0, y: 0 })] }
    const exported = buildSvg(diagram, env).svg
    const thumbnail = diagramThumbnail(diagram, env)
    for (const d of glyph) {
      expect(canvas).toContain(`d="${d}"`)
      expect(exported).toContain(`d="${d}"`)
      expect(thumbnail).toContain(`d="${d}"`)
    }
  })

  it.each(lucideOutline.map((s) => [s.id, s] as const))('%s: no glyph, so the palette shows an outline icon', (_id, shape) => {
    expect(renderToStaticMarkup(createElement(shape.icon))).toMatch(/^<svg[^>]*lucide/)
  })

  it('draws the outline icon of every pack 4 shape from the shape itself', () => {
    const ids = ['square', 'circle', 'triangle', 'trapezoid', 'cube', 'predefined-process', 'internal-storage', 'delay', 'display', 'tape', 'card', 'step', 'block-arrow', 'double-arrow']
    expect(drawnOutline.map((s) => s.id).sort()).toEqual(ids.sort())
  })

  it.each(drawnOutline.map((s) => [s.id, s] as const))('%s: the palette icon, canvas, SVG export and stencil thumbnails draw the same outline', (_id, shape) => {
    const paths = outlinePaths(shape.geometry, shape.defaultSize)
    const icon = [...renderToStaticMarkup(createElement(shape.icon)).matchAll(/<path d="([^"]+)"/g)].map((m) => m[1]!)
    // The icon is the same geometry at icon proportions: equal path for path once the numbers are taken out.
    expect(icon).toEqual(outlineIconPaths(shape.geometry, shape.defaultSize))
    expect(icon.map(skeleton)).toEqual(paths.map(skeleton))
    const canvas = renderToStaticMarkup(createElement(ShapeView, { type: shape.id, size: shape.defaultSize, label: shape.defaultLabel }))
    const diagram = { ...createEmptyDiagram(), nodes: [createNode(shape.id, { x: 0, y: 0 })] }
    const exported = buildSvg(diagram, env).svg
    const thumbnail = diagramThumbnail(diagram, env)
    for (const d of paths) {
      expect(canvas).toContain(`d="${d}"`)
      expect(exported).toContain(`d="${d}"`)
      expect(thumbnail).toContain(`d="${d}"`)
    }
  })

  it('every outline icon is distinct', () => {
    const drawn = drawnOutline.map((s) => outlineIconPaths(s.geometry, s.defaultSize).join(' '))
    expect(new Set(drawn).size).toBe(drawn.length)
  })
})

describe('Lucide artwork used as glyphs', () => {
  it.each([
    ['plug', Plug],
    ['server-cog', ServerCog],
    ['wrench', Wrench],
  ] as const)('%s matches the installed lucide-react', (name, Icon) => {
    const markup = renderToStaticMarkup(createElement(Icon))
    expect([...markup.matchAll(/<path d="([^"]+)"/g)].map((m) => m[1])).toEqual(LUCIDE[name])
  })
})
