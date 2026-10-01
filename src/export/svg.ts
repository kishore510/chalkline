import { getBezierPath, getSmoothStepPath, getStraightPath } from '@xyflow/react'
import { EDGE_DEFAULTS } from '@/canvas/flow'
import { sidePoint, type Box } from '@/canvas/floating'
import { HANDLE_POSITION } from '@/canvas/handles'
import { polylineMidpoint, polylinePath } from '@/canvas/polyline'
import { routeEdge } from '@/canvas/routing'
import { dashArray } from '@/canvas/appearance'
import { labelLayout, shapeGeometry } from '@/components/shapes/geometry'
import { buildRenderModel, type GroupView } from '@/canvas/renderModel'
import type { Route, RoutableNode } from '@/canvas/routing'
import { shiftAlongSide, spreadAttachments, type Spread } from '@/canvas/spread'
import { cssFamily, edgeLabelText, FONTS, resolveText, titleText, type FontFaceFile, type ResolvedText } from '@/fonts/registry'
import type { Diagram, DiagramEdge, DiagramNode, TextDefaults } from '@/schema/diagram'
import { layerIdOf, layerIndex } from '@/store/layers'
import { wrapText, type Measure, type MeasureFace } from './text'

/*
 * Builds a standalone SVG from the diagram data (not a screenshot), so it is
 * crisp at any size and opens in other tools. Colours are resolved to real
 * values for the chosen theme; nothing refers to CSS variables.
 */

export interface ExportEnv {
  /** Value of the --cl-<name> colour token in the theme being exported. */
  colour: (token: string) => string
  measure: Measure
  /**
   * Font files to embed, base64, keyed by registry file (FontFaceFile.file).
   * Only the faces the drawing uses are embedded; without data a face is
   * referred to by name only.
   */
  fontData?: ReadonlyMap<string, string>
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
  /** The font faces the labels use (whether or not their data was embedded). */
  faces: FontFaceFile[]
}

/** Collects the font faces drawn, so only those are embedded. */
class Faces {
  readonly used = new Set<FontFaceFile>()
  add(text: ResolvedText) {
    const face = text.font.faces.find((f) => f.style === (text.italic ? 'italic' : 'normal'))
    if (face) this.used.add(face)
    return face
  }
}

const measureFace = (t: ResolvedText): MeasureFace => ({ family: cssFamily(t.font), weight: t.weight, italic: t.italic })

/** SVG font attributes for a resolved label. */
const fontAttrs = (t: ResolvedText) => `font-family="${cssFamily(t.font)}" font-size="${r2(t.size)}" font-weight="${t.weight}"${t.italic ? ' font-style="italic"' : ''}`

/**
 * Underline or strikethrough as real lines (not text-decoration), so every
 * SVG viewer draws them. `y` is the line's centre (dominant-baseline central).
 */
function decorationLine(t: ResolvedText, x: number, y: number, width: number, colour: string): string {
  if (t.decoration === 'none' || width <= 0) return ''
  const offset = t.decoration === 'underline' ? 0.42 : 0.06
  const at = r2(y + t.size * offset)
  return `<line x1="${r2(x)}" y1="${at}" x2="${r2(x + width)}" y2="${at}" stroke="${colour}" stroke-width="${r2(Math.max(1, t.size / 14))}" stroke-linecap="butt"/>`
}

/**
 * A block of wrapped lines. `left`/`width` is the block the lines align in;
 * `top` is where the first line starts.
 */
function textBlock(t: ResolvedText, lines: string[], left: number, width: number, top: number, lineHeight: number, colour: string, env: ExportEnv): string {
  const face = measureFace(t)
  const anchor = t.align === 'left' ? 'start' : t.align === 'right' ? 'end' : 'middle'
  const x = t.align === 'left' ? left : t.align === 'right' ? left + width : left + width / 2
  const tspans = lines.map((line, i) => `<tspan x="${r2(x)}" y="${r2(top + (i + 0.5) * lineHeight)}">${escapeXml(line)}</tspan>`).join('')
  const decorations = lines
    .map((line, i) => {
      const w = env.measure(line, t.size, face)
      const start = anchor === 'start' ? x : anchor === 'end' ? x - w : x - w / 2
      return decorationLine(t, start, top + (i + 0.5) * lineHeight, w, colour)
    })
    .join('')
  return `<text ${fontAttrs(t)} fill="${colour}" text-anchor="${anchor}" dominant-baseline="central">${tspans}</text>${decorations}`
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

function nodeSvg(node: DiagramNode, env: ExportEnv, bounds: Bounds, defaults: TextDefaults | undefined, faces: Faces): string {
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
    const text = resolveText(style, defaults, env.fontSize)
    faces.add(text)
    const face = measureFace(text)
    const lineHeight = text.size * env.lineHeight
    const free = fit === 'free'
    const maxWidth = free ? Math.max(box.width, env.freeLabelMax) - 8 : box.width - 2 * env.nodePadding
    const lines = wrapText(node.label, Math.max(1, maxWidth), text.size, env.measure, face)
    const blockHeight = lines.length * lineHeight
    const top = align === 'start' ? box.y + 4 : box.y + (box.height - blockHeight) / 2
    const cx = box.x + box.width / 2
    const colour = resolve(style.textColour, 'node-text', env)
    const widest = Math.max(...lines.map((l) => env.measure(l, text.size, face)))
    bounds.add({ x: x + cx - widest / 2, y: y + top, width: widest, height: blockHeight })
    // Free labels (actor, text) size to their text and sit centred; others align within the padded box.
    const block = free ? { left: cx - widest / 2, width: widest } : { left: box.x + env.nodePadding, width: box.width - 2 * env.nodePadding }
    parts.push(textBlock(text, lines, block.left, block.width, top, lineHeight, colour, env))
  }
  return `<g transform="translate(${r2(x)} ${r2(y)})">${parts.join('')}</g>`
}

type Arrow = 'arrow' | 'closed'

/** A group's background, border, header strip and title, drawn behind everything else. */
function groupSvg(view: GroupView, env: ExportEnv, bounds: Bounds, defaults: TextDefaults | undefined, faces: Faces): string {
  const { box, side, header, group } = view
  bounds.add(box)
  const fill = resolve(group.style.fill, 'group-fill', env)
  const stroke = resolve(group.style.stroke, 'group-border', env)
  const strip = side === 'top' ? { x: box.x, y: box.y, width: box.width, height: Math.min(header, box.height) } : { x: box.x, y: box.y, width: Math.min(header, box.width), height: box.height }
  const parts = [
    `<rect x="${r2(box.x)}" y="${r2(box.y)}" width="${r2(box.width)}" height="${r2(box.height)}" rx="10" fill="${fill}" stroke="${stroke}" stroke-width="${env.nodeStrokeWidth}"/>`,
    `<rect x="${r2(strip.x)}" y="${r2(strip.y)}" width="${r2(strip.width)}" height="${r2(strip.height)}" rx="10" fill="${env.colour('group-header')}"/>`,
  ]
  const label = group.label.trim()
  if (label) {
    // Titles: semibold, in the diagram's font (or the group's own, if a file sets one); left-aligned along a top strip, centred up a left one.
    const text = { ...titleText(group.style, defaults, env.fontSize), align: side === 'top' ? 'left' : 'center' } as const
    faces.add(text)
    const fs = text.size
    const lh = fs * env.lineHeight
    // Titles run along the strip: across a top header, up a left one.
    const run = side === 'top' ? strip.width - 2 * env.nodePadding : strip.height - 2 * env.nodePadding
    const lines = wrapText(label, Math.max(1, run), fs, env.measure, measureFace(text))
    const block = lines.length * lh
    const colour = env.colour('text')
    if (side === 'top') {
      parts.push(textBlock(text, lines, strip.x + env.nodePadding, run, strip.y + (strip.height - block) / 2, lh, colour, env))
    } else {
      const cx = strip.x + strip.width / 2
      const cy = strip.y + strip.height / 2
      parts.push(`<g transform="rotate(-90 ${r2(cx)} ${r2(cy)})">${textBlock(text, lines, cx - run / 2, run, cy - block / 2, lh, colour, env)}</g>`)
    }
  }
  return parts.join('')
}

function edgeSvg(
  edge: DiagramEdge,
  nodes: readonly RoutableNode[],
  route: Route,
  spread: Spread | undefined,
  env: ExportEnv,
  bounds: Bounds,
  marker: (type: Arrow, colour: string) => string,
  defaults: TextDefaults | undefined,
  faces: Faces,
): string {
  const source = nodes.find((n) => n.id === edge.source)
  const target = nodes.find((n) => n.id === edge.target)
  if (!source || !target) return ''
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
    const sp = shiftAlongSide(sidePoint({ ...source.position, ...source.size, type: source.type }, route.sourceSide), route.sourceSide, spread?.source ?? 0)
    const tp = shiftAlongSide(sidePoint({ ...target.position, ...target.size, type: target.type }, route.targetSide), route.targetSide, spread?.target ?? 0)
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
    const text = edgeLabelText(style, defaults, env.edgeLabelFontSize)
    faces.add(text)
    const fs = text.size
    const textWidth = env.measure(edge.label, fs, measureFace(text))
    const w = textWidth + 12
    const h = fs + 6
    const box = { x: labelX - w / 2, y: labelY - h / 2, width: w, height: h }
    bounds.add(box)
    out +=
      `<rect x="${r2(box.x)}" y="${r2(box.y)}" width="${r2(w)}" height="${r2(h)}" rx="4" fill="${env.colour('surface')}" stroke="${env.colour('border')}" stroke-width="${env.edgeWidth}"/>` +
      textBlock(text, [edge.label], labelX - textWidth / 2, textWidth, labelY - fs * env.lineHeight / 2, fs * env.lineHeight, env.colour('text'), env)
  }
  return out
}

/** `includeHidden`: also draw items on hidden layers (off by default: export what's visible). */
export function buildSvg(diagram: Diagram, env: ExportEnv, options: { padding?: number; background?: boolean; includeHidden?: boolean } = {}): SvgExport {
  const padding = options.padding ?? 32
  const bounds = new Bounds()
  const faces = new Faces()
  const defaults = diagram.textDefaults
  const markers = new Map<string, string>()
  const marker = (type: Arrow, colour: string) => {
    const key = `${type}|${colour}`
    if (!markers.has(key)) markers.set(key, `m${markers.size}`)
    return markers.get(key)!
  }

  // Draw what the canvas shows: collapsed groups hide their members and take their connectors.
  const model = buildRenderModel(diagram, { includeHidden: options.includeHidden })
  const routes = new Map(model.edges.map((e) => [e.id, routeEdge(model.routingNodes, e)]))
  const spreads = spreadAttachments(model.routingNodes, model.edges, routes)
  const shown = new Set(model.routingNodes.map((n) => n.id))
  // Layer by layer, bottom to top; within a layer, groups behind connectors behind shapes.
  const layerOf = (item: { layerId?: string }) => layerIndex(diagram, layerIdOf(item))
  let content = ''
  for (let layer = 0; layer < diagram.layers.length; layer++) {
    content += model.groups
      .filter((v) => v.layer === layer)
      .map((v) => groupSvg(v, env, bounds, defaults, faces))
      .join('')
    content += model.edges
      .filter((e) => layerOf(e) === layer)
      .map((e) => edgeSvg(e, model.routingNodes, routes.get(e.id)!, spreads.get(e.id), env, bounds, marker, defaults, faces))
      .join('')
    content += diagram.nodes
      .filter((n) => layerOf(n) === layer && shown.has(n.id))
      .map((n) => nodeSvg(n, env, bounds, defaults, faces))
      .join('')
  }
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
  const style = fontFaceCss(faces.used, env.fontData) + 'text{font-synthesis:none}'
  const background = options.background === false ? '' : `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${env.colour('canvas')}"/>`

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${x} ${y} ${width} ${height}">` +
    `<title>${escapeXml(diagram.meta.title)}</title>` +
    `<defs><style>${style}</style>${defs.join('')}</defs>` +
    background +
    content +
    '</svg>'
  return { svg, width, height, faces: [...faces.used] }
}

/** @font-face rules for the faces used, with their data inlined (faces without data are skipped). */
export function fontFaceCss(used: Iterable<FontFaceFile>, data: ReadonlyMap<string, string> | undefined): string {
  if (!data) return ''
  let css = ''
  for (const face of used) {
    const font = FONTS.find((f) => f.faces.includes(face))
    const base64 = data.get(face.file)
    if (!font || !base64) continue
    css += `@font-face{font-family:'${font.family}';font-style:${face.style};font-weight:${face.weight.min} ${face.weight.max};src:url(data:font/woff2;base64,${base64}) format('woff2')}`
  }
  return css
}
