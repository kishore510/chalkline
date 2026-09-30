import { getBezierPath, getSmoothStepPath, getStraightPath } from '@xyflow/react'
import { EDGE_DEFAULTS } from '@/canvas/flow'
import { sidePoint, type Box } from '@/canvas/floating'
import { HANDLE_POSITION } from '@/canvas/handles'
import { polylineMidpoint, polylinePath } from '@/canvas/polyline'
import { routeEdge } from '@/canvas/routing'
import { dashArray } from '@/canvas/appearance'
import { labelLayout, shapeGeometry } from '@/components/shapes/geometry'
import type { Diagram, DiagramEdge, DiagramNode } from '@/schema/diagram'
import { wrapText, type Measure } from './text'

/*
 * Builds a standalone SVG from the diagram data (not a screenshot), so it is
 * crisp at any size and opens in other tools. Colours are resolved to real
 * values for the chosen theme; nothing refers to CSS variables.
 */

export interface ExportEnv {
  /** Value of the --cl-<name> colour token in the theme being exported. */
  colour: (token: string) => string
  measure: Measure
  fontFamily: string
  /** Optional @font-face CSS to embed (needed when rasterising to PNG/PDF). */
  fontCss?: string
  /** Default sizes, from the design tokens. */
  fontSize: number
  lineHeight: number
  nodePadding: number
  nodeStrokeWidth: number
  edgeWidth: number
  freeLabelMax: number
  edgeLabelFontSize: number
}

export interface SvgExport {
  svg: string
  width: number
  height: number
}

const escapeXml = (text: string) => text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!)
const r2 = (n: number) => Math.round(n * 100) / 100

function resolve(value: string | undefined, fallbackToken: string, env: ExportEnv): string {
  if (!value) return env.colour(fallbackToken)
  if (/^#[0-9a-f]{6}$/i.test(value)) return value.toLowerCase()
  const token = value.match(/^token:([a-z0-9-]+)$/)?.[1]
  return (token && env.colour(token)) || env.colour(fallbackToken)
}

class Bounds {
  x0 = Infinity
  y0 = Infinity
  x1 = -Infinity
  y1 = -Infinity
  add(b: Box) {
    this.x0 = Math.min(this.x0, b.x)
    this.y0 = Math.min(this.y0, b.y)
    this.x1 = Math.max(this.x1, b.x + b.width)
    this.y1 = Math.max(this.y1, b.y + b.height)
  }
  get empty() {
    return this.x0 === Infinity
  }
}

function nodeSvg(node: DiagramNode, env: ExportEnv, bounds: Bounds): string {
  const { x, y } = node.position
  const size = node.size
  const style = node.style
  bounds.add({ x, y, ...size })
  const { body, detail } = shapeGeometry(node.type, size)
  const fill = resolve(style.fill, 'node-fill', env)
  const stroke = resolve(style.stroke, 'node-stroke', env)
  const strokeWidth = style.strokeWidth ?? env.nodeStrokeWidth
  const parts: string[] = []
  const strokeAttrs = `stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linejoin="round" stroke-linecap="round"`
  for (const d of body) parts.push(`<path d="${d}" fill="${fill}" ${strokeAttrs}/>`)
  for (const d of detail) parts.push(`<path d="${d}" fill="none" ${strokeAttrs}/>`)

  if (node.label.trim()) {
    const { box, fit, align } = labelLayout(node.type, size)
    const fontSize = style.fontSize ?? env.fontSize
    const lineHeight = fontSize * env.lineHeight
    const free = fit === 'free'
    const maxWidth = free ? Math.max(box.width, env.freeLabelMax) - 8 : box.width - 2 * env.nodePadding
    const lines = wrapText(node.label, Math.max(1, maxWidth), fontSize, env.measure)
    const blockHeight = lines.length * lineHeight
    const top = align === 'start' ? box.y + 4 : box.y + (box.height - blockHeight) / 2
    const cx = box.x + box.width / 2
    const colour = resolve(style.textColour, 'node-text', env)
    const widest = Math.max(...lines.map((l) => env.measure(l, fontSize)))
    bounds.add({ x: x + cx - widest / 2, y: y + top, width: widest, height: blockHeight })
    const tspans = lines.map((line, i) => `<tspan x="${r2(cx)}" y="${r2(top + (i + 0.5) * lineHeight)}">${escapeXml(line)}</tspan>`).join('')
    parts.push(
      `<text font-size="${fontSize}" font-weight="500" fill="${colour}" text-anchor="middle" dominant-baseline="central">${tspans}</text>`,
    )
  }
  return `<g transform="translate(${r2(x)} ${r2(y)})">${parts.join('')}</g>`
}

type Arrow = 'arrow' | 'closed'

function edgeSvg(edge: DiagramEdge, diagram: Diagram, env: ExportEnv, bounds: Bounds, marker: (type: Arrow, colour: string) => string): string {
  const source = diagram.nodes.find((n) => n.id === edge.source)
  const target = diagram.nodes.find((n) => n.id === edge.target)
  if (!source || !target) return ''
  const route = routeEdge(diagram.nodes, edge)
  const style = edge.style
  const colour = resolve(style.colour, 'edge', env)
  const width = style.width ?? env.edgeWidth
  const lineType = style.lineType ?? EDGE_DEFAULTS.lineType

  let d: string
  let labelX: number
  let labelY: number
  if (route.kind === 'detour') {
    d = polylinePath(route.points, lineType === 'smoothstep' || lineType === 'bezier' ? 8 : 0)
    ;({ x: labelX, y: labelY } = polylineMidpoint(route.points))
  } else {
    const sp = sidePoint({ ...source.position, ...source.size }, route.sourceSide)
    const tp = sidePoint({ ...target.position, ...target.size }, route.targetSide)
    const params = {
      sourceX: sp.x,
      sourceY: sp.y,
      targetX: tp.x,
      targetY: tp.y,
      sourcePosition: HANDLE_POSITION[route.sourceSide],
      targetPosition: HANDLE_POSITION[route.targetSide],
    }
    ;[d, labelX, labelY] =
      lineType === 'straight' ? getStraightPath(params) : lineType === 'bezier' ? getBezierPath(params) : getSmoothStepPath({ ...params, borderRadius: lineType === 'step' ? 0 : undefined })
  }
  for (const p of route.points) bounds.add({ x: p.x, y: p.y, width: 0, height: 0 })

  const start = style.startArrow ?? EDGE_DEFAULTS.startArrow
  const end = style.endArrow ?? EDGE_DEFAULTS.endArrow
  const attrs = [
    `d="${d}"`,
    'fill="none"',
    `stroke="${colour}"`,
    `stroke-width="${width}"`,
    'stroke-linecap="round"',
    'stroke-linejoin="round"',
    style.dashed ? `stroke-dasharray="${dashArray(width)}"` : '',
    start !== 'none' ? `marker-start="url(#${marker(start, colour)})"` : '',
    end !== 'none' ? `marker-end="url(#${marker(end, colour)})"` : '',
  ].filter(Boolean)
  let out = `<path ${attrs.join(' ')}/>`

  if (edge.label.trim()) {
    const fs = env.edgeLabelFontSize
    const textWidth = env.measure(edge.label, fs)
    const w = textWidth + 12
    const h = fs + 6
    const box = { x: labelX - w / 2, y: labelY - h / 2, width: w, height: h }
    bounds.add(box)
    out +=
      `<rect x="${r2(box.x)}" y="${r2(box.y)}" width="${r2(w)}" height="${r2(h)}" rx="4" fill="${env.colour('surface')}" stroke="${env.colour('border')}" stroke-width="${env.edgeWidth}"/>` +
      `<text x="${r2(labelX)}" y="${r2(labelY)}" font-size="${fs}" font-weight="500" fill="${env.colour('text')}" text-anchor="middle" dominant-baseline="central">${escapeXml(edge.label)}</text>`
  }
  return out
}

export function buildSvg(diagram: Diagram, env: ExportEnv, options: { padding?: number; background?: boolean } = {}): SvgExport {
  const padding = options.padding ?? 32
  const bounds = new Bounds()
  const markers = new Map<string, string>()
  const marker = (type: Arrow, colour: string) => {
    const key = `${type}|${colour}`
    if (!markers.has(key)) markers.set(key, `m${markers.size}`)
    return markers.get(key)!
  }

  const edges = diagram.edges.map((e) => edgeSvg(e, diagram, env, bounds, marker)).join('')
  const nodes = diagram.nodes.map((n) => nodeSvg(n, env, bounds)).join('')
  if (bounds.empty) bounds.add({ x: 0, y: 0, width: 1, height: 1 })

  const x = Math.floor(bounds.x0 - padding)
  const y = Math.floor(bounds.y0 - padding)
  const width = Math.ceil(bounds.x1 + padding) - x
  const height = Math.ceil(bounds.y1 + padding) - y

  // Same arrow shapes as the canvas (React Flow's markers), sized in stroke widths.
  const defs = [...markers].map(([key, id]) => {
    const [type, colour] = key.split('|') as [Arrow, string]
    const shape =
      type === 'closed'
        ? `<polyline points="-5,-4 0,0 -5,4 -5,-4" fill="${colour}" stroke="${colour}" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/>`
        : `<polyline points="-5,-4 0,0 -5,4" fill="none" stroke="${colour}" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/>`
    return `<marker id="${id}" viewBox="-10 -10 20 20" markerWidth="18" markerHeight="18" markerUnits="strokeWidth" orient="auto-start-reverse" refX="0" refY="0">${shape}</marker>`
  })
  const style = `${env.fontCss ?? ''}text{font-family:${env.fontFamily}}`
  const background = options.background === false ? '' : `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${env.colour('canvas')}"/>`

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${x} ${y} ${width} ${height}">` +
    `<title>${escapeXml(diagram.meta.title)}</title>` +
    `<defs><style>${style}</style>${defs.join('')}</defs>` +
    background +
    edges +
    nodes +
    '</svg>'
  return { svg, width, height }
}
