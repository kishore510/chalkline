import { z } from 'zod'
import { createEmptyDiagram, parseDiagram, type Diagram, type TextDefaults } from '@/schema/diagram'
import { pasteFragment } from '@/store/clipboard'

/*
 * Templates are whole diagrams to start from. A template file wraps a diagram
 * (any saved version; it goes through the normal migrations) with catalogue
 * details.
 */

export const TEMPLATE_KIND = 'chalkline-template'

const TemplateFileSchema = z.object({
  kind: z.literal(TEMPLATE_KIND),
  id: z.string().min(1),
  name: z.string().trim().min(1).max(100),
  category: z.string().trim().min(1).max(60),
  description: z.string().max(300).default(''),
  tags: z.array(z.string().trim().min(1).max(40)).default([]),
  diagram: z.unknown(),
})

export interface Template {
  id: string
  name: string
  category: string
  description: string
  tags: string[]
  diagram: Diagram
}

/** Parses a template file; throws if the envelope or diagram is invalid. */
export function parseTemplate(raw: unknown): Template {
  const file = TemplateFileSchema.parse(raw)
  return { ...file, diagram: parseDiagram(file.diagram) }
}

/**
 * A new diagram from a template: fresh ids for every shape, connector and
 * group (ends, memberships and nesting remapped), current timestamps, the
 * template's name as title. Layers keep their ids and settings. Text defaults
 * are the template's own, else `textDefaults` (from settings, for new diagrams).
 */
export function diagramFromTemplate(template: Template, now = new Date(), textDefaults?: TextDefaults): Diagram {
  const time = now.toISOString()
  const base: Diagram = { ...createEmptyDiagram(template.name), layers: template.diagram.layers.map((l) => ({ ...l })) }
  const { diagram } = pasteFragment(base, template.diagram, { x: 0, y: 0 })
  const text = template.diagram.textDefaults ?? textDefaults
  return { ...diagram, meta: { title: template.name, created: time, updated: time }, ...(text && { textDefaults: { ...text } }) }
}

/** Whether replacing the current diagram would lose anything. */
export const hasContent = (d: Diagram) => d.nodes.length + d.edges.length + d.groups.length > 0
