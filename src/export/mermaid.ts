import tokensCss from '@/styles/tokens.css?raw'
import { collapsedBox } from '@/canvas/renderModel'
import { parseThemeColours } from '@/lib/colour'
import type { Diagram, DiagramEdge, DiagramGroup, DiagramNode, EdgeStyle, NodeStyle } from '@/schema/diagram'
import { ancestors, type Box } from '@/store/groups'
import { isLayerHidden, layerIdOf } from '@/store/layers'
import { getShape, isKnownShape } from '@/shapes/registry'

/*
 * Mermaid flowchart export: a pure function of the saved diagram (no React,
 * canvas or DOM), so it is unit-tested and identical everywhere. It exports
 * what is on screen: hidden layers are left out and a collapsed group is one
 * shape. Raw diagram ids never reach the text: shapes are n1, n2…, groups g1,
 * g2…, in diagram order. Everything Mermaid can't express is listed in
 * `warnings`, for the "What is not included" list.
 */

export type MermaidDirection = 'auto' | 'TD' | 'LR'

export interface MermaidOptions {
  /** Default 'auto': left to right when the exported shapes are wider than tall, else top down. */
  direction?: MermaidDirection
  /** Notes as `%% note for nX: …` comment lines. Default off. */
  includeNotes?: boolean
}

export interface MermaidExport {
  text: string
  warnings: string[]
}

/* ---------- Shapes ---------- */

/** The classic flowchart shapes used (no `@{ shape: … }` syntax), as opening and closing brackets. */
const BRACKETS = {
  rectangle: ['[', ']'],
  rounded: ['(', ')'],
  stadium: ['([', '])'],
  cylinder: ['[(', ')]'],
  circle: ['((', '))'],
  diamond: ['{', '}'],
  hexagon: ['{{', '}}'],
  parallelogram: ['[/', '/]'],
} as const satisfies Record<string, readonly [string, string]>

export type MermaidShape = keyof typeof BRACKETS

/**
 * Registry shape id to Mermaid shape. Only the obvious matches: shapes whose
 * outline is one of these (pack shapes drawn on a rounded, hexagon or
 * cylinder frame map to that frame). Anything else exports as a rectangle,
 * with one warning per shape type.
 */
export const MERMAID_SHAPES: Readonly<Record<string, MermaidShape>> = {
  rectangle: 'rectangle',
  square: 'rectangle',
  firewall: 'rectangle',
  rounded: 'rounded',
  router: 'rounded',
  'load-balancer': 'rounded',
  cdn: 'rounded',
  microservice: 'rounded',
  worker: 'rounded',
  llm: 'rounded',
  embeddings: 'rounded',
  'ai-agent': 'rounded',
  'agent-identity': 'rounded',
  'mcp-client': 'rounded',
  'mcp-server': 'rounded',
  tool: 'rounded',
  ellipse: 'stadium',
  queue: 'stadium',
  database: 'cylinder',
  cache: 'cylinder',
  'vector-db': 'cylinder',
  'semantic-cache': 'cylinder',
  circle: 'circle',
  diamond: 'diamond',
  hexagon: 'hexagon',
  'api-gateway': 'hexagon',
  'ai-gateway': 'hexagon',
  parallelogram: 'parallelogram',
}

/* ---------- Text ---------- */

// Characters that end or change a quoted label, start a comment, or would be read as markup or an
// entity, written as Mermaid entity codes: named where Mermaid users expect it, else by code point.
const NAMED: Record<string, string> = { '"': 'quot', '<': 'lt', '>': 'gt' }
const entity = (char: string) => `#${NAMED[char] ?? char.codePointAt(0)};`

/**
 * Text for inside `"…"`: one line (newlines become `<br/>`), with every
 * character that could break out of the quotes or the line written as a
 * Mermaid entity code (`#quot;`, `#124;`…). Empty text becomes one space,
 * since Mermaid needs something between the quotes.
 */
export function escapeMermaidLabel(text: string): string {
  if (text.trim() === '') return ' '
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '')
    .replace(/%%|[#"|[\](){}`<>&]/g, (match) => (match === '%%' ? entity('%').repeat(2) : entity(match)))
    .replace(/\n/g, '<br/>')
}

const quoted = (text: string) => `"${escapeMermaidLabel(text)}"`

/* ---------- Colours ---------- */

// Exports use the light theme's values for colour presets (token references).
let lightColours: Record<string, string> | undefined
const HEX = /^#[0-9a-f]{6}$/i

/** A stored colour as #rrggbb, or undefined if it can't be resolved. */
function hexOf(value: string | undefined): string | undefined {
  if (!value) return undefined
  if (HEX.test(value)) return value.toLowerCase()
  const token = value.match(/^token:([a-z0-9-]+)$/)?.[1]
  if (!token) return undefined
  lightColours ??= parseThemeColours(tokensCss, 'light')
  const hex = lightColours[token]
  return hex && HEX.test(hex) ? hex : undefined
}

/* ---------- Connectors ---------- */

/** Widths drawn as a thick Mermaid line (the "Thick" and "Heavy" options). */
const THICK_WIDTH = 3

const hasHead = (arrow: EdgeStyle['startArrow']) => arrow === 'arrow' || arrow === 'closed'

// Links by line kind: no arrowheads, an arrowhead at the end, arrowheads at both ends.
const LINKS = {
  normal: ['---', '-->', '<-->'],
  dashed: ['-.-', '-.->', '<-.->'],
  thick: ['===', '==>', '<==>'],
} as const

/** The Mermaid link for a style, and whether the ends must swap (an arrowhead at the start only). */
function linkFor(style: EdgeStyle): { op: string; swap: boolean; thickDashed: boolean } {
  const start = hasHead(style.startArrow ?? 'none')
  const end = hasHead(style.endArrow ?? 'arrow')
  const dashed = style.dashed === true
  const thick = (style.width ?? 0) >= THICK_WIDTH
  // Mermaid has no thick dashed line: dashed wins, as it says more about the connector.
  const kind = dashed ? 'dashed' : thick ? 'thick' : 'normal'
  return { op: LINKS[kind][start && end ? 2 : start || end ? 1 : 0], swap: start && !end, thickDashed: dashed && thick }
}

/* ---------- Helpers ---------- */

const TEXT_STYLE_KEYS = ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'textDecoration', 'textAlign', 'textColour'] as const
const hasTextStyle = (style: Record<string, unknown>) => TEXT_STYLE_KEYS.some((k) => style[k] !== undefined)

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** "a, b and c" */
function listOf(parts: string[]): string {
  return parts.length <= 1 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`
}

const INDENT = '    '

function addTo<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const list = map.get(key)
  if (list) list.push(value)
  else map.set(key, [value])
}

/* ---------- Export ---------- */

export function toMermaid(diagram: Diagram, { direction = 'auto', includeNotes = false }: MermaidOptions = {}): MermaidExport {
  const groupsById = new Map(diagram.groups.map((g) => [g.id, g]))
  const nodesById = new Map(diagram.nodes.map((n) => [n.id, n]))
  const layerHidden = new Map(diagram.layers.map((l) => [l.id, isLayerHidden(diagram, l.id)]))
  const hidden = (item: { layerId?: string }) => layerHidden.get(layerIdOf(item)) === true

  // The outermost collapsed group around a group, itself included (as the canvas works it out).
  const collapsedAround = new Map<string, DiagramGroup | undefined>()
  const outermostCollapsed = (group: DiagramGroup): DiagramGroup | undefined => {
    if (collapsedAround.has(group.id)) return collapsedAround.get(group.id)
    let found: DiagramGroup | undefined
    for (const g of [group, ...ancestors(diagram, group)]) if (g.collapsed) found = g
    collapsedAround.set(group.id, found)
    return found
  }

  /* --- What is exported, and where --- */

  type Shown = { kind: 'subgraph' | 'collapsed'; group: DiagramGroup }
  const shownGroups = new Map<string, Shown>()
  let hiddenGroups = 0
  for (const group of diagram.groups) {
    const around = outermostCollapsed(group)
    if (around && around !== group) continue // inside a collapsed group: not on screen
    if (hidden(group)) {
      hiddenGroups++ // only the frame: members are placed in the nearest shown group
      continue
    }
    shownGroups.set(group.id, { kind: group.collapsed ? 'collapsed' : 'subgraph', group })
  }

  /** The nearest enclosing subgraph that is exported (undefined: top level). */
  const containerOf = (groupId: string | undefined): string | undefined => {
    const seen = new Set<string>()
    for (let g = groupId === undefined ? undefined : groupsById.get(groupId); g && !seen.has(g.id); g = g.parentId === undefined ? undefined : groupsById.get(g.parentId)) {
      seen.add(g.id)
      if (shownGroups.get(g.id)?.kind === 'subgraph') return g.id
    }
    return undefined
  }

  // Shapes: exported, moved onto a collapsed group, or left out.
  const endpoint = new Map<string, string>() // node id -> exported id (itself or a collapsed group)
  const exportedNodes: DiagramNode[] = []
  let hiddenShapes = 0
  for (const node of diagram.nodes) {
    if (hidden(node)) {
      hiddenShapes++
      continue
    }
    const group = node.groupId === undefined ? undefined : groupsById.get(node.groupId)
    const around = group && outermostCollapsed(group)
    if (around) {
      // Inside a collapsed group whose frame is on a hidden layer: nothing on screen to attach to.
      if (shownGroups.has(around.id)) endpoint.set(node.id, around.id)
      continue
    }
    endpoint.set(node.id, node.id)
    exportedNodes.push(node)
  }

  // Safe sequential ids, in diagram order.
  const ids = new Map<string, string>()
  exportedNodes.forEach((n, i) => ids.set(n.id, `n${i + 1}`))
  let groupCount = 0
  for (const group of diagram.groups) if (shownGroups.has(group.id)) ids.set(group.id, `g${++groupCount}`)

  /* --- Styles --- */

  const warnings: string[] = []
  const classes = new Map<string, { name: string; members: string[] }>()
  let unresolvedColours = 0
  const styleOf = (id: string, style: NodeStyle) => {
    const fill = hexOf(style.fill)
    const stroke = hexOf(style.stroke)
    if ((style.fill && !fill) || (style.stroke && !stroke)) unresolvedColours++
    if (!fill && !stroke) return
    const definition = [fill && `fill:${fill}`, stroke && `stroke:${stroke}`].filter(Boolean).join(',')
    let entry = classes.get(definition)
    if (!entry) classes.set(definition, (entry = { name: `c${classes.size + 1}`, members: [] }))
    entry.members.push(id)
  }

  /* --- Body --- */

  const lines: string[] = []
  const fallbacks = new Map<string, number>()

  const emitNode = (node: DiagramNode, indent: string) => {
    const id = ids.get(node.id)!
    const shape = MERMAID_SHAPES[node.type]
    if (!shape) fallbacks.set(node.type, (fallbacks.get(node.type) ?? 0) + 1)
    const [open, close] = BRACKETS[shape ?? 'rectangle']
    lines.push(`${indent}${id}${open}${quoted(node.label)}${close}`)
    if (includeNotes && node.notes.trim()) lines.push(`${indent}%% note for ${id}: ${escapeMermaidLabel(node.notes.trim())}`)
    styleOf(id, node.style)
  }

  // Children of each container (undefined: top level), in diagram order.
  const nodesIn = new Map<string | undefined, DiagramNode[]>()
  for (const node of exportedNodes) addTo(nodesIn, containerOf(node.groupId), node)
  const groupsIn = new Map<string | undefined, DiagramGroup[]>()
  for (const { group } of shownGroups.values()) addTo(groupsIn, containerOf(group.parentId), group)

  const emitContainer = (key: string | undefined, indent: string) => {
    for (const node of nodesIn.get(key) ?? []) emitNode(node, indent)
    const groups = groupsIn.get(key) ?? []
    const collapsed = groups.filter((g) => g.collapsed)
    for (const group of collapsed) {
      const id = ids.get(group.id)!
      lines.push(`${indent}${id}[${quoted(group.label)}]`)
      styleOf(id, group.style)
    }
    // Lanes in the order they appear in their pool.
    const along = (g: DiagramGroup) => ((g.orientation ?? 'horizontal') === 'horizontal' ? g.position.y : g.position.x)
    const open = groups.filter((g) => !g.collapsed)
    const subgraphs = [...open.filter((g) => g.kind !== 'lane'), ...open.filter((g) => g.kind === 'lane').sort((a, b) => along(a) - along(b))]
    for (const group of subgraphs) {
      const id = ids.get(group.id)!
      lines.push(`${indent}subgraph ${id}[${quoted(group.label)}]`)
      emitContainer(group.id, indent + INDENT)
      lines.push(`${indent}end`)
      styleOf(id, group.style)
    }
  }
  emitContainer(undefined, INDENT)

  /* --- Connectors --- */

  let missing = 0
  let hiddenConnectors = 0
  let thickDashed = 0
  let filledHeads = 0
  let colouredConnectors = 0
  let pinned = 0
  const seen = new Set<string>()
  const exportedEdges: DiagramEdge[] = []
  for (const edge of diagram.edges) {
    const source = nodesById.get(edge.source)
    const target = nodesById.get(edge.target)
    if (!source || !target) {
      missing++
      continue
    }
    if (hidden(edge) || hidden(source) || hidden(target)) {
      hiddenConnectors++
      continue
    }
    const from = endpoint.get(edge.source)
    const to = endpoint.get(edge.target)
    // An end inside a collapsed group on a hidden layer: not on screen.
    if (from === undefined || to === undefined) {
      hiddenConnectors++
      continue
    }
    // Both ends folded into the same collapsed group: nothing to draw (a real self-loop stays).
    if (from === to && edge.source !== edge.target) continue
    const link = linkFor(edge.style)
    const [a, b] = link.swap ? [to, from] : [from, to]
    const label = edge.label.trim() ? `|${quoted(edge.label)}|` : ''
    const line = `${ids.get(a)} ${link.op}${label} ${ids.get(b)}`
    if (seen.has(line)) continue
    seen.add(line)
    lines.push(`${INDENT}${line}`)
    if (includeNotes && edge.notes.trim()) lines.push(`${INDENT}%% note for ${ids.get(a)} ${link.op} ${ids.get(b)}: ${escapeMermaidLabel(edge.notes.trim())}`)
    exportedEdges.push(edge)
    if (link.thickDashed) thickDashed++
    if (edge.style.startArrow === 'closed' || edge.style.endArrow === 'closed') filledHeads++
    if (edge.style.colour !== undefined) colouredConnectors++
    if (edge.sourceHandle || edge.targetHandle) pinned++
  }

  /* --- Classes --- */

  for (const [definition, { name }] of classes) lines.push(`${INDENT}classDef ${name} ${definition}`)
  for (const { name, members } of classes.values()) lines.push(`${INDENT}class ${members.join(',')} ${name}`)

  /* --- Direction --- */

  let chosen: 'TD' | 'LR' = direction === 'auto' ? 'TD' : direction
  if (direction === 'auto') {
    const boxes: Box[] = [
      ...exportedNodes.map((n) => ({ ...n.position, ...n.size })),
      ...[...shownGroups.values()].filter((s) => s.kind === 'collapsed').map((s) => collapsedBox(s.group)),
    ]
    if (boxes.length > 0) {
      const left = Math.min(...boxes.map((b) => b.x))
      const right = Math.max(...boxes.map((b) => b.x + b.width))
      const top = Math.min(...boxes.map((b) => b.y))
      const bottom = Math.max(...boxes.map((b) => b.y + b.height))
      if (right - left > bottom - top) chosen = 'LR'
    }
  }

  /* --- What is not included --- */

  const collapsedCount = [...shownGroups.values()].filter((s) => s.kind === 'collapsed').length
  const exportedGroups = [...shownGroups.values()].map((s) => s.group)
  if (exportedNodes.length + shownGroups.size > 0) warnings.push('Positions and sizes are not kept: Mermaid lays the diagram out itself.')
  for (const [type, count] of [...fallbacks].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    const name = isKnownShape(type) ? `“${getShape(type).name}” (${type})` : `“${type}”`
    warnings.push(`Shape ${name} has no Mermaid equivalent: exported as a rectangle (${plural(count, 'shape')}).`)
  }
  if (collapsedCount > 0) warnings.push(`${plural(collapsedCount, 'collapsed group')} ${collapsedCount === 1 ? 'is' : 'are'} exported as a single shape, as on screen; what’s inside is left out.`)
  if (thickDashed > 0) warnings.push(`Mermaid has no line that is both thick and dashed: ${plural(thickDashed, 'connector')} exported as dashed.`)
  if (filledHeads > 0) warnings.push('Filled arrowheads are exported as plain arrowheads.')
  if (colouredConnectors > 0) warnings.push('Connector colours are not kept.')
  if (exportedEdges.length > 0) warnings.push('Connector line types and routing are not kept; thin and medium widths export as normal lines, thick and heavy as thick.')
  if (pinned > 0) warnings.push('Pinned connector sides are not kept.')
  const styled = [...exportedNodes, ...exportedGroups].some((i) => hasTextStyle(i.style)) || exportedEdges.some((e) => hasTextStyle(e.style)) || diagram.textDefaults !== undefined
  if (styled) warnings.push('Fonts and text styling (font, size, bold, italic, underline, alignment and text colour) are not kept.')
  if ([...exportedNodes, ...exportedGroups].some((i) => i.style.strokeWidth !== undefined)) warnings.push('Border widths are not kept.')
  if (unresolvedColours > 0) warnings.push(`${plural(unresolvedColours, 'colour')} couldn’t be converted and ${unresolvedColours === 1 ? 'is' : 'are'} left out.`)
  const withNotes = exportedNodes.filter((n) => n.notes.trim()).length + exportedEdges.filter((e) => e.notes.trim()).length
  if (!includeNotes && withNotes > 0) warnings.push(`Notes are left out (${plural(withNotes, 'item')} ${withNotes === 1 ? 'has' : 'have'} notes). Turn on Include notes to add them as comments.`)
  if (includeNotes && withNotes > 0) warnings.push('Notes are included as comments, which Mermaid doesn’t draw.')
  if (diagram.layers.length > 1) warnings.push('Layers are not kept: everything exported is on one level.')
  const hiddenParts = [
    hiddenShapes > 0 && plural(hiddenShapes, 'shape'),
    hiddenGroups > 0 && plural(hiddenGroups, 'group frame'),
    hiddenConnectors > 0 && plural(hiddenConnectors, 'connector'),
  ].filter((p): p is string => Boolean(p))
  if (hiddenParts.length > 0) warnings.push(`Hidden layers are left out: ${listOf(hiddenParts)}.`)
  if (diagram.nodes.some((n) => n.locked) || diagram.groups.some((g) => g.locked) || diagram.layers.some((l) => l.locked)) warnings.push('Locks are not kept.')
  if (missing > 0) warnings.push(`${plural(missing, 'connector')} ${missing === 1 ? 'is' : 'are'} left out because a shape ${missing === 1 ? 'it joins is' : 'they join is'} missing.`)

  return { text: [`flowchart ${chosen}`, ...lines].join('\n') + '\n', warnings }
}
