import { resolveColour } from '@/lib/colour'
import type { EdgeStyle, NodeStyle } from '@/schema/diagram'

/** Resolved CSS values for a node's style. Undefined means "use the theme default". */
export interface NodeAppearance {
  fill?: string
  stroke?: string
  strokeWidth?: number
  textColour?: string
  fontSize?: number
}

export function nodeAppearance(style: NodeStyle): NodeAppearance {
  return {
    fill: style.fill && resolveColour(style.fill, 'var(--cl-node-fill)'),
    stroke: style.stroke && resolveColour(style.stroke, 'var(--cl-node-stroke)'),
    strokeWidth: style.strokeWidth,
    textColour: style.textColour && resolveColour(style.textColour, 'var(--cl-node-text)'),
    fontSize: style.fontSize,
  }
}

/** Dash pattern that scales with line width so thick dashed lines stay readable. */
export function dashArray(width: number): string {
  return `${Math.max(4, width * 4)} ${Math.max(3, width * 3)}`
}

export interface EdgeAppearance {
  colour: string
  width: number
  dashArray?: string
}

export function edgeAppearance(style: EdgeStyle, selected: boolean, defaultWidth: number): EdgeAppearance {
  const width = style.width ?? defaultWidth
  return {
    colour: selected ? 'var(--cl-accent)' : resolveColour(style.colour, 'var(--cl-edge)'),
    width,
    dashArray: style.dashed ? dashArray(width) : undefined,
  }
}
