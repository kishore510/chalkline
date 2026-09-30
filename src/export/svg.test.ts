import { describe, expect, it } from 'vitest'
import { fixtures } from '@/fixtures'
import { parseDiagram } from '@/schema/diagram'
import { buildSvg, type ExportEnv } from './svg'

// A fixed palette so output is predictable; every token gets a distinct colour.
const palette: Record<string, string> = {
  canvas: '#fafafa',
  'node-fill': '#ffffff',
  'node-stroke': '#333333',
  'node-text': '#111111',
  edge: '#555555',
  surface: '#ffffff',
  border: '#dddddd',
  text: '#111111',
  'accent-subtle': '#e0f0ff',
  accent: '#1f6aa5',
  'swatch-blue-soft': '#dbe9f5',
}

const env: ExportEnv = {
  colour: (token) => palette[token] ?? '',
  measure: (text, size) => text.length * size * 0.55,
  fontFamily: 'Inter, sans-serif',
  fontSize: 15,
  lineHeight: 1.35,
  nodePadding: 8,
  nodeStrokeWidth: 1.5,
  edgeWidth: 1.5,
  freeLabelMax: 200,
  edgeLabelFontSize: 12,
}

const parse = (svg: string) => {
  const count = (re: RegExp) => (svg.match(re) ?? []).length
  return { count }
}

describe('buildSvg', () => {
  const diagram = parseDiagram(fixtures['web-architecture'])
  const { svg, width, height } = buildSvg(diagram, env)

  it('is a standalone SVG sized to the content plus padding', () => {
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true)
    expect(svg).toContain(`width="${width}" height="${height}"`)
    expect(width).toBeGreaterThan(800)
    expect(height).toBeGreaterThan(300)
  })

  it('draws every node and edge', () => {
    const { count } = parse(svg)
    expect(count(/<g transform="translate/g)).toBe(diagram.nodes.length)
    expect(count(/marker-end=/g)).toBeGreaterThanOrEqual(diagram.edges.length)
  })

  it('uses real colours, never CSS variables', () => {
    expect(svg).not.toContain('var(')
    expect(svg).toContain('fill="#e0f0ff"') // token:accent-subtle on the database
    expect(svg).toContain('stroke="#1f6aa5"') // hex colour on the SQL edge
  })

  it('draws edge labels, dashes and arrowheads', () => {
    expect(svg).toContain('>SQL</text>')
    expect(svg).toContain('stroke-dasharray="8 6"')
    expect(svg).toContain('<marker id="m0"')
  })

  it('escapes text', () => {
    const withMarkup = { ...diagram, nodes: diagram.nodes.map((n, i) => (i === 0 ? { ...n, label: 'A & <B>' } : n)) }
    expect(buildSvg(withMarkup, env).svg).toContain('A &amp; &lt;B&gt;')
  })

  it('wraps long labels onto several lines', () => {
    const labels = parseDiagram(fixtures['label-cases'])
    const out = buildSvg(labels, env).svg
    const longLabel = out.split('<text').find((t) => t.includes('identity'))!
    expect((longLabel.match(/<tspan/g) ?? []).length).toBeGreaterThan(1)
  })

  it('handles an empty diagram and optional background', () => {
    const empty = buildSvg(parseDiagram(fixtures.empty), env, { background: false })
    expect(empty.svg).not.toContain('<rect')
    expect(empty.width).toBeGreaterThan(0)
  })
})
