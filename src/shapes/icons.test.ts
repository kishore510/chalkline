import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { glyphIcon, iconPaths } from './glyphIcon'
import { SHAPES } from './registry'

/*
 * The palette icon and the mark drawn on the canvas come from one place: a
 * shape's glyph. These tests stop a second, hand-picked icon creeping back.
 */

/** A path's commands with the numbers taken out: the same glyph drawn at any size or place gives the same skeleton. */
const skeleton = (d: string) => d.replace(/-?\d+(\.\d+)?/g, '#')

const withGlyph = SHAPES.filter((s) => s.glyph)
const withoutGlyph = SHAPES.filter((s) => !s.glyph)

describe('shape icons', () => {
  it('covers the glyph shapes', () => {
    const ids = ['firewall', 'router', 'load-balancer', 'api-gateway', 'cdn', 'cache', 'microservice', 'worker', 'ai-gateway', 'ai-guardrails', 'llm', 'vector-db', 'embeddings', 'semantic-cache', 'ai-agent', 'agent-identity', 'prompt-template']
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

  it.each(withoutGlyph.map((s) => [s.id, s] as const))('%s: no glyph, so the palette shows an outline icon', (_id, shape) => {
    expect(renderToStaticMarkup(createElement(shape.icon))).toMatch(/^<svg[^>]*lucide/)
  })
})
