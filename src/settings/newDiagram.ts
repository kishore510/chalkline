import { createEmptyDiagram, type Diagram, type EdgeStyle, type TextDefaults } from '@/schema/diagram'
import { getSettings } from './settingsStore'

/** The text defaults a NEW diagram starts with, from settings (none set means the app defaults). */
export function newDiagramTextDefaults(text: TextDefaults = getSettings().text): TextDefaults | undefined {
  const out: TextDefaults = {}
  if (text.fontFamily !== undefined) out.fontFamily = text.fontFamily
  if (text.fontSize !== undefined) out.fontSize = text.fontSize
  return Object.keys(out).length ? out : undefined
}

/** A blank diagram with the text defaults from settings. Existing diagrams keep their own. */
export function createNewDiagram(title?: string, text?: TextDefaults): Diagram {
  const diagram = createEmptyDiagram(title)
  const textDefaults = newDiagramTextDefaults(text)
  return textDefaults ? { ...diagram, textDefaults } : diagram
}

/** The arrowhead connectors get when none is set (EDGE_DEFAULTS in canvas/flow.ts; a test keeps them equal). */
export const RENDER_DEFAULT_ARROWHEAD = 'arrow'

/**
 * Style for a NEW connector, from the "default arrow" setting. The renderer's
 * own default stays implicit (an empty style), so diagrams stay as small as before.
 */
export function newConnectorStyle(arrowhead: NonNullable<EdgeStyle['endArrow']> = getSettings().canvas.arrowhead): EdgeStyle {
  return arrowhead === RENDER_DEFAULT_ARROWHEAD ? {} : { endArrow: arrowhead }
}
