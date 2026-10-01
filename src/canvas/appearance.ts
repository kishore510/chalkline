import { resolveText, textCss } from '@/fonts/registry'
import { resolveColour } from '@/lib/colour'
import type { EdgeStyle, NodeStyle, TextDefaults } from '@/schema/diagram'

/** Resolved CSS values for a node's style. Undefined means "use the theme default". */
export interface NodeAppearance {
  fill?: string
  stroke?: string
  strokeWidth?: number
  textColour?: string
  fontSize?: number
  /** Font, weight, italic, decoration and alignment (real faces only); missing means the app's label look. */
  text?: ReturnType<typeof textCss>
}

/** `defaults`: the diagram's text defaults, which the node's own values override. */
export function nodeAppearance(style: NodeStyle, defaults?: TextDefaults): NodeAppearance {
  return {
    fill: style.fill && resolveColour(style.fill, 'var(--cl-node-fill)'),
    stroke: style.stroke && resolveColour(style.stroke, 'var(--cl-node-stroke)'),
    strokeWidth: style.strokeWidth,
    textColour: style.textColour && resolveColour(style.textColour, 'var(--cl-node-text)'),
    fontSize: style.fontSize ?? defaults?.fontSize,
    // The size is applied separately (it has a touch minimum), so the base size here doesn't matter.
    text: textCss(resolveText(style, defaults, 0)),
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
