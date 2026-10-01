import { FolderKanban, Radio, type LucideIcon } from 'lucide-react'
import type { Size } from '@/schema/diagram'
import { boxSidePoint, r2 as n, rectOutline, sampleCubic } from './outline'
import { glyphIcon, penAt } from './glyphIcon'
import { cylinderRy, hexagonPoints, hexInset, polygon, roundedRect } from './paths'
import { SIDES, type Box, type Glyph, type Pen, type Point, type ShapeCategory, type ShapeDefinition, type Side } from './types'

/*
 * Shapes pack 2: networking, more architecture, and AI & ML. Each is a frame
 * (an outline such as a rounded box, hexagon, cylinder or shield) plus an
 * optional glyph: a small stroke-only mark drawn in a band above the label,
 * the way the server draws its rack units above its label.
 */

/* ---------- Frames ---------- */

interface Frame {
  body: (w: number, h: number) => string[]
  detail?: (w: number, h: number) => string[]
  outline: (w: number, h: number) => Point[]
  anchor: (w: number, h: number, side: Side) => Point
  sides?: readonly Side[]
  spreadSides: readonly Side[]
  /** The area left for the glyph and the label. */
  inner: (w: number, h: number) => Box
}

const midpoints = (w: number, h: number, side: Side) => boxSidePoint(w, h, side)
const whole = (w: number, h: number): Box => ({ x: 0, y: 0, width: w, height: h })

const rectFrame: Frame = {
  body: (w, h) => [`M0 0H${n(w)}V${n(h)}H0Z`],
  outline: rectOutline,
  anchor: midpoints,
  spreadSides: SIDES,
  inner: whole,
}

const roundedFrame: Frame = { ...rectFrame, body: (w, h) => [roundedRect(0, 0, w, h, 12)] }

/** Same proportions as the Hexagon shape. */
const hexFrame: Frame = {
  body: (w, h) => [polygon(hexagonPoints(w, h))],
  outline: hexagonPoints,
  anchor: midpoints,
  spreadSides: ['top', 'bottom'],
  inner: (w, h) => {
    const i = hexInset(w, h)
    return { x: i, y: 0, width: w - 2 * i, height: h }
  },
}

/** Same cylinder as the Database shape. */
const cylinderFrame: Frame = {
  body: (w, h) => {
    const ry = cylinderRy(w, h)
    return [`M0 ${ry}A${n(w / 2)} ${ry} 0 0 1 ${n(w)} ${ry}V${n(h - ry)}A${n(w / 2)} ${ry} 0 0 1 0 ${n(h - ry)}Z`]
  },
  detail: (w, h) => {
    const ry = cylinderRy(w, h)
    return [`M0 ${ry}A${n(w / 2)} ${ry} 0 0 0 ${n(w)} ${ry}`]
  },
  outline: rectOutline,
  anchor: midpoints,
  spreadSides: ['left', 'right'],
  inner: (w, h) => {
    const ry = cylinderRy(w, h)
    return { x: 0, y: 2 * ry, width: w, height: Math.max(0, h - 3 * ry) }
  },
}

/** A long bar with taps above and below, like stations on a bus. */
const busCap = (w: number, h: number) => Math.min(h / 2, w / 2)
const tapLength = (h: number) => h * 0.18
const busFrame: Frame = {
  body: (w, h) => [roundedRect(0, 0, w, h, busCap(w, h))],
  detail: (w, h) => {
    const t = tapLength(h)
    return [0.3, 0.5, 0.7].flatMap((f) => [`M${n(w * f)} 0V${n(t)}`, `M${n(w * f)} ${n(h)}V${n(h - t)}`])
  },
  outline: rectOutline,
  anchor: midpoints,
  spreadSides: ['top', 'bottom'],
  inner: (w, h) => {
    const x = busCap(w, h) * 0.5
    return { x, y: tapLength(h), width: Math.max(0, w - 2 * x), height: h - 2 * tapLength(h) }
  },
}

/** A bucket: an open rim on top, tapering to a narrower base. */
const bucketTaper = (w: number, h: number) => Math.min(w * 0.12, h * 0.2)
function bucketPoints(w: number, h: number): Point[] {
  const ry = cylinderRy(w, h)
  const i = bucketTaper(w, h)
  return [
    { x: 0, y: ry },
    { x: w / 2, y: 0 },
    { x: w, y: ry },
    { x: w - i, y: h - ry * 0.6 },
    { x: w / 2, y: h },
    { x: i, y: h - ry * 0.6 },
  ]
}
const bucketFrame: Frame = {
  body: (w, h) => {
    const ry = cylinderRy(w, h)
    const i = bucketTaper(w, h)
    const base = n(ry * 0.6)
    return [`M0 ${ry}A${n(w / 2)} ${ry} 0 0 1 ${n(w)} ${ry}L${n(w - i)} ${n(h - base)}A${n(w / 2 - i)} ${base} 0 0 1 ${n(i)} ${n(h - base)}Z`]
  },
  detail: (w, h) => {
    const ry = cylinderRy(w, h)
    return [`M0 ${ry}A${n(w / 2)} ${ry} 0 0 0 ${n(w)} ${ry}`]
  },
  outline: bucketPoints,
  anchor: (w, h, side) => {
    const [l, top, r, br, bottom, bl] = bucketPoints(w, h) as [Point, Point, Point, Point, Point, Point]
    const mid = (a: Point, b: Point) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
    return side === 'top' ? top : side === 'bottom' ? bottom : side === 'left' ? mid(l, bl) : mid(r, br)
  },
  spreadSides: [],
  inner: (w, h) => {
    const ry = cylinderRy(w, h)
    const i = bucketTaper(w, h)
    return { x: i, y: 2 * ry, width: Math.max(0, w - 2 * i), height: Math.max(0, h - 3 * ry) }
  },
}

/** A shield: flat top, straight sides, curving to a point at the bottom. */
const SHIELD_SIDE = 0.45
function shieldCurves(w: number, h: number): [Point, Point, Point, Point][] {
  return [
    [{ x: w, y: h * SHIELD_SIDE }, { x: w, y: h * 0.75 }, { x: w * 0.75, y: h * 0.9 }, { x: w / 2, y: h }],
    [{ x: w / 2, y: h }, { x: w * 0.25, y: h * 0.9 }, { x: 0, y: h * 0.75 }, { x: 0, y: h * SHIELD_SIDE }],
  ]
}
const shieldFrame: Frame = {
  body: (w, h) => {
    const pt = (p: Point) => `${n(p.x)} ${n(p.y)}`
    const curves = shieldCurves(w, h).map(([, c1, c2, end]) => `C${pt(c1)} ${pt(c2)} ${pt(end)}`)
    return [`M0 0H${n(w)}V${n(h * SHIELD_SIDE)}${curves.join('')}Z`]
  },
  outline: (w, h) => [{ x: 0, y: 0 }, { x: w, y: 0 }, ...shieldCurves(w, h).flatMap(([a, b, c, d]) => [a, ...sampleCubic(a, b, c, d)])].slice(0, -1),
  anchor: (w, h, side) => (side === 'left' ? { x: 0, y: h * 0.3 } : side === 'right' ? { x: w, y: h * 0.3 } : midpoints(w, h, side)),
  spreadSides: ['top'],
  inner: (w, h) => ({ x: w * 0.12, y: h * 0.06, width: w * 0.76, height: h * 0.64 }),
}

/** A page with its top-right corner folded over. */
const foldSize = (w: number, h: number) => Math.min(w, h) * 0.2
const pagePoints = (w: number, h: number): Point[] => {
  const f = foldSize(w, h)
  return [{ x: 0, y: 0 }, { x: w - f, y: 0 }, { x: w, y: f }, { x: w, y: h }, { x: 0, y: h }]
}
const pageFrame: Frame = {
  body: (w, h) => [polygon(pagePoints(w, h))],
  detail: (w, h) => {
    const f = foldSize(w, h)
    return [`M${n(w - f)} 0V${n(f)}H${n(w)}`]
  },
  outline: pagePoints,
  anchor: midpoints,
  spreadSides: ['left', 'bottom'],
  inner: (w, h) => {
    const top = foldSize(w, h) * 0.6
    return { x: 0, y: top, width: w, height: h - top }
  },
}

/* ---------- Glyphs ---------- */

const line = (pen: Pen, ...points: [number, number][]) => 'M' + points.map(([u, v]) => pen.p(u, v)).join('L')
const closed = (pen: Pen, ...points: [number, number][]) => line(pen, ...points) + 'Z'

/** A four-pointed sparkle centred on (u, v). */
const star = (pen: Pen, u: number, v: number, r: number) => {
  const k = r * 0.12
  return (
    `M${pen.p(u, v - r)}Q${pen.p(u + k, v - k)} ${pen.p(u + r, v)}Q${pen.p(u + k, v + k)} ${pen.p(u, v + r)}` +
    `Q${pen.p(u - k, v + k)} ${pen.p(u - r, v)}Q${pen.p(u - k, v - k)} ${pen.p(u, v - r)}Z`
  )
}

/** A lightning bolt in the box (u, v) to (u + s, v + s). */
const bolt = (pen: Pen, u: number, v: number, s: number) =>
  closed(pen, ...([[0.58, 0], [0.15, 0.58], [0.48, 0.58], [0.4, 1], [0.85, 0.4], [0.52, 0.4]] as const).map(([x, y]): [number, number] => [u + x * s, v + y * s]))

const GLYPHS = {
  bricks: (pen) => [
    closed(pen, [0, 0.15], [1, 0.15], [1, 0.85], [0, 0.85]),
    line(pen, [0, 0.38], [1, 0.38]),
    line(pen, [0, 0.62], [1, 0.62]),
    line(pen, [0.5, 0.15], [0.5, 0.38]),
    line(pen, [0.25, 0.38], [0.25, 0.62]),
    line(pen, [0.75, 0.38], [0.75, 0.62]),
    line(pen, [0.5, 0.62], [0.5, 0.85]),
  ],
  crossArrows: (pen) => [
    line(pen, [0.5, 0], [0.5, 1]),
    line(pen, [0, 0.5], [1, 0.5]),
    line(pen, [0.36, 0.14], [0.5, 0], [0.64, 0.14]),
    line(pen, [0.36, 0.86], [0.5, 1], [0.64, 0.86]),
    line(pen, [0.14, 0.36], [0, 0.5], [0.14, 0.64]),
    line(pen, [0.86, 0.36], [1, 0.5], [0.86, 0.64]),
  ],
  fork: (pen) => [
    pen.c(0.1, 0.5, 0.1),
    line(pen, [0.2, 0.5], [0.45, 0.5]),
    line(pen, [0.45, 0.5], [0.95, 0.12]),
    line(pen, [0.45, 0.5], [1, 0.5]),
    line(pen, [0.45, 0.5], [0.95, 0.88]),
    line(pen, [0.86, 0.38], [1, 0.5], [0.86, 0.62]),
  ],
  door: (pen) => [line(pen, [0.3, 1], [0.3, 0], [0.95, 0], [0.95, 1]), line(pen, [0, 0.55], [0.7, 0.55]), line(pen, [0.56, 0.42], [0.7, 0.55], [0.56, 0.68])],
  globe: (pen) => [
    pen.c(0.5, 0.5, 0.5),
    line(pen, [0, 0.5], [1, 0.5]),
    line(pen, [0.1, 0.25], [0.9, 0.25]),
    line(pen, [0.1, 0.75], [0.9, 0.75]),
    `M${pen.p(0.5, 0)}Q${pen.p(0.1, 0.5)} ${pen.p(0.5, 1)}Q${pen.p(0.9, 0.5)} ${pen.p(0.5, 0)}Z`,
  ],
  bolt: (pen) => [bolt(pen, 0, 0, 1)],
  cube: (pen) => [
    closed(pen, [0.5, 0], [0.95, 0.25], [0.95, 0.75], [0.5, 1], [0.05, 0.75], [0.05, 0.25]),
    line(pen, [0.05, 0.25], [0.5, 0.5], [0.95, 0.25]),
    line(pen, [0.5, 0.5], [0.5, 1]),
  ],
  clock: (pen) => [pen.c(0.5, 0.56, 0.42), line(pen, [0.5, 0.32], [0.5, 0.56], [0.68, 0.66]), line(pen, [0.38, 0.04], [0.62, 0.04]), line(pen, [0.5, 0.04], [0.5, 0.14])],
  gatewaySpark: (pen) => [line(pen, [0, 0.5], [0.42, 0.5]), line(pen, [0.3, 0.38], [0.42, 0.5], [0.3, 0.62]), star(pen, 0.74, 0.5, 0.26)],
  check: (pen) => [line(pen, [0.1, 0.52], [0.38, 0.8], [0.9, 0.22])],
  sparkle: (pen) => [star(pen, 0.42, 0.58, 0.42), star(pen, 0.86, 0.14, 0.14)],
  vectors: (pen) => [
    line(pen, [0.08, 0.92], [0.85, 0.2]),
    line(pen, [0.08, 0.92], [0.92, 0.72]),
    line(pen, [0.08, 0.92], [0.4, 0.08]),
    pen.c(0.85, 0.2, 0.07),
    pen.c(0.92, 0.72, 0.07),
    pen.c(0.4, 0.08, 0.07),
  ],
  columnVector: (pen) => [
    line(pen, [0.28, 0], [0.12, 0], [0.12, 1], [0.28, 1]),
    line(pen, [0.72, 0], [0.88, 0], [0.88, 1], [0.72, 1]),
    line(pen, [0.36, 0.22], [0.64, 0.22]),
    line(pen, [0.36, 0.5], [0.64, 0.5]),
    line(pen, [0.36, 0.78], [0.64, 0.78]),
  ],
  boltSpark: (pen) => [bolt(pen, 0, 0.1, 0.8), star(pen, 0.84, 0.18, 0.16)],
  bot: (pen) => [
    closed(pen, [0.1, 0.3], [0.9, 0.3], [0.9, 0.96], [0.1, 0.96]),
    line(pen, [0.5, 0.3], [0.5, 0.13]),
    pen.c(0.5, 0.07, 0.06),
    pen.c(0.34, 0.58, 0.08),
    pen.c(0.66, 0.58, 0.08),
    line(pen, [0.38, 0.8], [0.62, 0.8]),
  ],
  badge: (pen) => [
    closed(pen, [0, 0.12], [1, 0.12], [1, 0.88], [0, 0.88]),
    pen.c(0.28, 0.4, 0.11),
    `M${pen.p(0.12, 0.76)}Q${pen.p(0.28, 0.48)} ${pen.p(0.44, 0.76)}`,
    line(pen, [0.56, 0.38], [0.88, 0.38]),
    line(pen, [0.56, 0.56], [0.88, 0.56]),
  ],
  braces: (pen) => {
    const brace = (m: (u: number) => number) =>
      `M${pen.p(m(0.36), 0)}Q${pen.p(m(0.2), 0)} ${pen.p(m(0.2), 0.2)}L${pen.p(m(0.2), 0.38)}Q${pen.p(m(0.2), 0.5)} ${pen.p(m(0.06), 0.5)}` +
      `Q${pen.p(m(0.2), 0.5)} ${pen.p(m(0.2), 0.62)}L${pen.p(m(0.2), 0.8)}Q${pen.p(m(0.2), 1)} ${pen.p(m(0.36), 1)}`
    return [brace((u) => u), brace((u) => 1 - u), line(pen, [0.46, 0.5], [0.54, 0.5])]
  },
} satisfies Record<string, Glyph>

/* ---------- Building a shape ---------- */

/** Height of the glyph band above the label: a share of the frame, capped. */
const bandOf = (inner: Box) => Math.min(inner.height * 0.42, 40, inner.width * 0.4)

function layout(frame: Frame, glyph: Glyph | undefined, { width: w, height: h }: Size) {
  const inner = frame.inner(w, h)
  const band = glyph ? bandOf(inner) : 0
  return { inner, band, label: { x: inner.x, y: inner.y + band, width: inner.width, height: Math.max(0, inner.height - band) } }
}

interface BaseSpec {
  id: string
  name: string
  category: ShapeCategory
  description: string
  keywords: readonly string[]
  defaultSize: Size
  defaultLabel: string
  frame: Frame
}

/** A shape with a glyph takes its palette icon from the glyph; only a shape without one names an icon. */
type Spec = BaseSpec & ({ glyph: Glyph; icon?: never } | { glyph?: never; icon: LucideIcon })

function shape({ frame, glyph, icon, ...spec }: Spec): ShapeDefinition {
  return {
    ...spec,
    icon: glyph ? glyphIcon(glyph) : icon!,
    glyph,
    minSize: { width: 60, height: 40 },
    keepAspect: false,
    defaultStyle: {},
    geometry: (size) => {
      const { width: w, height: h } = size
      const detail = frame.detail?.(w, h) ?? []
      if (glyph) {
        const { inner, band } = layout(frame, glyph, size)
        const s = band * 0.7
        const x = inner.x + (inner.width - s) / 2
        const y = inner.y + (band - s) / 2
        detail.push(...glyph(penAt(x, y, s)))
      }
      return { body: frame.body(w, h), detail, extent: whole(w, h) }
    },
    label: (size) => ({ box: layout(frame, glyph, size).label, fit: 'contain', align: 'center' }),
    outline: ({ width, height }) => frame.outline(width, height),
    sides: frame.sides ?? SIDES,
    anchor: ({ width, height }, side) => frame.anchor(width, height, side),
    spreadSides: frame.spreadSides,
  }
}

const BOX = { width: 160, height: 100 }
const SMALL_BOX = { width: 140, height: 100 }
const CYLINDER = { width: 120, height: 120 }

/* ---------- Networking ---------- */

export const NETWORKING: readonly ShapeDefinition[] = [
  shape({ id: 'firewall', name: 'Firewall', category: 'networking', description: 'filters traffic between network zones', keywords: ['security', 'waf', 'acl', 'boundary', 'perimeter'], defaultSize: SMALL_BOX, defaultLabel: 'Firewall', frame: rectFrame, glyph: GLYPHS.bricks }),
  shape({ id: 'router', name: 'Router / switch', category: 'networking', description: 'forwards packets between networks or ports', keywords: ['switch', 'routing', 'lan', 'vlan', 'subnet'], defaultSize: SMALL_BOX, defaultLabel: 'Router', frame: roundedFrame, glyph: GLYPHS.crossArrows }),
  shape({ id: 'load-balancer', name: 'Load balancer', category: 'networking', description: 'spreads requests across several instances', keywords: ['lb', 'balancing', 'traffic', 'reverse proxy', 'distribute'], defaultSize: BOX, defaultLabel: 'Load balancer', frame: roundedFrame, glyph: GLYPHS.fork }),
  shape({ id: 'api-gateway', name: 'API gateway', category: 'networking', description: 'single entry point that authenticates, limits and routes API calls', keywords: ['api', 'ingress', 'rate limit', 'routing', 'entry point'], defaultSize: BOX, defaultLabel: 'API gateway', frame: hexFrame, glyph: GLYPHS.door }),
  shape({ id: 'cdn', name: 'CDN / edge node', category: 'networking', description: 'serves content from locations close to users', keywords: ['cdn', 'edge', 'pop', 'static content', 'content delivery'], defaultSize: SMALL_BOX, defaultLabel: 'CDN', frame: roundedFrame, glyph: GLYPHS.globe }),
]

/* ---------- Architecture ---------- */

export const ARCHITECTURE: readonly ShapeDefinition[] = [
  shape({ id: 'cache', name: 'Cache store', category: 'architecture', description: 'fast in-memory key-value store in front of slower storage', keywords: ['cache', 'redis', 'memcached', 'in-memory', 'key-value'], defaultSize: CYLINDER, defaultLabel: 'Cache', frame: cylinderFrame, glyph: GLYPHS.bolt }),
  shape({ id: 'message-bus', name: 'Message bus / pub-sub', category: 'architecture', icon: Radio, description: 'publishes events to many subscribers', keywords: ['pub-sub', 'pubsub', 'event bus', 'topic', 'broker', 'kafka', 'events', 'streaming'], defaultSize: { width: 220, height: 60 }, defaultLabel: 'Event bus', frame: busFrame }),
  shape({ id: 'microservice', name: 'Microservice', category: 'architecture', description: 'small independently deployed service', keywords: ['service', 'component', 'container', 'module'], defaultSize: SMALL_BOX, defaultLabel: 'Service', frame: roundedFrame, glyph: GLYPHS.cube }),
  shape({ id: 'object-storage', name: 'Object storage / data lake', category: 'architecture', icon: FolderKanban, description: 'stores files and blobs at scale', keywords: ['blob', 'bucket', 's3', 'data lake', 'files', 'lake'], defaultSize: { width: 140, height: 120 }, defaultLabel: 'Object storage', frame: bucketFrame }),
  shape({ id: 'worker', name: 'Worker / cron job', category: 'architecture', description: 'background or scheduled processing', keywords: ['cron', 'job', 'batch', 'scheduled', 'background', 'timer'], defaultSize: SMALL_BOX, defaultLabel: 'Worker', frame: roundedFrame, glyph: GLYPHS.clock }),
]

/* ---------- AI & ML ---------- */

export const AI: readonly ShapeDefinition[] = [
  shape({ id: 'ai-gateway', name: 'AI gateway', category: 'ai', description: 'one controlled entry point to models, tools and agents', keywords: ['llm proxy', 'model gateway', 'mcp', 'a2a', 'routing', 'policy'], defaultSize: BOX, defaultLabel: 'AI gateway', frame: hexFrame, glyph: GLYPHS.gatewaySpark }),
  shape({ id: 'ai-guardrails', name: 'AI guardrails', category: 'ai', description: 'checks prompts and responses for unsafe or sensitive content', keywords: ['safety', 'moderation', 'pii', 'redaction', 'prompt injection', 'filter'], defaultSize: { width: 120, height: 140 }, defaultLabel: 'Guardrails', frame: shieldFrame, glyph: GLYPHS.check }),
  shape({ id: 'llm', name: 'Foundation model (LLM)', category: 'ai', description: 'a large language or foundation model', keywords: ['llm', 'model', 'genai', 'language model', 'inference'], defaultSize: BOX, defaultLabel: 'LLM', frame: roundedFrame, glyph: GLYPHS.sparkle }),
  shape({ id: 'vector-db', name: 'Vector database', category: 'ai', description: 'stores embeddings for similarity search', keywords: ['vector', 'embeddings', 'similarity', 'rag', 'retrieval', 'index'], defaultSize: CYLINDER, defaultLabel: 'Vector DB', frame: cylinderFrame, glyph: GLYPHS.vectors }),
  shape({ id: 'embeddings', name: 'Embeddings engine', category: 'ai', description: 'turns text or images into vectors', keywords: ['embedding', 'encoder', 'vectorise', 'vectorize', 'rag'], defaultSize: BOX, defaultLabel: 'Embeddings', frame: roundedFrame, glyph: GLYPHS.columnVector }),
  shape({ id: 'semantic-cache', name: 'Semantic cache', category: 'ai', description: 'reuses answers to similar prompts', keywords: ['semantic', 'similar prompts', 'llm cache', 'cost'], defaultSize: CYLINDER, defaultLabel: 'Semantic cache', frame: cylinderFrame, glyph: GLYPHS.boltSpark }),
  shape({ id: 'ai-agent', name: 'AI agent / orchestrator', category: 'ai', description: 'plans steps and calls models and tools', keywords: ['agent', 'orchestrator', 'planner', 'bot', 'autonomous', 'workflow'], defaultSize: BOX, defaultLabel: 'AI agent', frame: roundedFrame, glyph: GLYPHS.bot }),
  shape({ id: 'agent-identity', name: 'Agent identity', category: 'ai', description: 'credentials an agent acts under', keywords: ['identity', 'credential', 'service account', 'workload identity', 'oauth', 'token'], defaultSize: BOX, defaultLabel: 'Agent identity', frame: roundedFrame, glyph: GLYPHS.badge }),
  shape({ id: 'prompt-template', name: 'Prompt template', category: 'ai', description: 'reusable prompt with placeholders', keywords: ['prompt', 'template', 'system prompt', 'instructions'], defaultSize: { width: 140, height: 120 }, defaultLabel: 'Prompt', frame: pageFrame, glyph: GLYPHS.braces }),
]
