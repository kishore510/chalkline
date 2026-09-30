import type { Diagram, DiagramEdge, DiagramGroup, DiagramNode } from '@/schema/diagram'

/*
 * Canonical JSON for saved diagrams: a fixed key order and one level of
 * indentation per nesting, so files diff cleanly in git. Optional fields are
 * written only when set.
 */

type Json = null | boolean | number | string | Json[] | { [key: string]: Json }

/** Returns a copy of `obj` with keys in `order` first (when present), then any others alphabetically. */
function ordered(obj: object, order: readonly string[]): { [key: string]: Json } {
  const source = obj as Record<string, Json | undefined>
  const out: { [key: string]: Json } = {}
  for (const key of order) if (source[key] !== undefined) out[key] = source[key]!
  for (const key of Object.keys(source).sort()) if (!(key in out) && source[key] !== undefined) out[key] = source[key]!
  return out
}

const NODE_KEYS = ['id', 'type', 'position', 'size', 'label', 'notes', 'style', 'groupId'] as const
const EDGE_KEYS = ['id', 'source', 'target', 'sourceHandle', 'targetHandle', 'label', 'notes', 'style'] as const
const GROUP_KEYS = ['id', 'label', 'position', 'size', 'style', 'collapsed'] as const
const NODE_STYLE_KEYS = ['fill', 'stroke', 'strokeWidth', 'textColour', 'fontSize'] as const
const EDGE_STYLE_KEYS = ['lineType', 'dashed', 'startArrow', 'endArrow', 'colour', 'width'] as const

function node(n: DiagramNode) {
  return ordered({ ...n, position: ordered(n.position, ['x', 'y']), size: ordered(n.size, ['width', 'height']), style: ordered(n.style, NODE_STYLE_KEYS) }, NODE_KEYS)
}

function edge(e: DiagramEdge) {
  return ordered({ ...e, style: ordered(e.style, EDGE_STYLE_KEYS) }, EDGE_KEYS)
}

function group(g: DiagramGroup) {
  return ordered({ ...g, position: ordered(g.position, ['x', 'y']), size: ordered(g.size, ['width', 'height']), style: ordered(g.style, NODE_STYLE_KEYS) }, GROUP_KEYS)
}

export function toCanonical(diagram: Diagram): { [key: string]: Json } {
  return ordered(
    {
      schemaVersion: diagram.schemaVersion,
      meta: ordered(diagram.meta, ['title', 'created', 'updated']),
      nodes: diagram.nodes.map(node),
      edges: diagram.edges.map(edge),
      groups: diagram.groups.map(group),
    },
    ['schemaVersion', 'meta', 'nodes', 'edges', 'groups'],
  )
}

/**
 * Pretty JSON with each node, edge and group on its own line, so adding,
 * moving or restyling one item changes one line in a git diff.
 */
export function serializeDiagram(diagram: Diagram): string {
  const doc = toCanonical(diagram)
  const lines = ['{']
  const keys = Object.keys(doc)
  keys.forEach((key, i) => {
    const value = doc[key]!
    const comma = i < keys.length - 1 ? ',' : ''
    if (Array.isArray(value) && value.length > 0) {
      lines.push(`  ${JSON.stringify(key)}: [`)
      value.forEach((item, j) => lines.push(`    ${JSON.stringify(item)}${j < value.length - 1 ? ',' : ''}`))
      lines.push(`  ]${comma}`)
    } else {
      lines.push(`  ${JSON.stringify(key)}: ${JSON.stringify(value)}${comma}`)
    }
  })
  lines.push('}')
  return lines.join('\n') + '\n'
}

/** A safe file name from the diagram title. */
export function fileNameFor(title: string, extension: string): string {
  const base =
    title
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'diagram'
  return `${base}.${extension}`
}
