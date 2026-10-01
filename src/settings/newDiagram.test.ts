import { describe, expect, it } from 'vitest'
import { EDGE_DEFAULTS } from '@/canvas/flow'
import { DiagramSchema } from '@/schema/diagram'
import { connect } from '@/store/ops'
import { diagramFromTemplate } from '@/stencils/templates'
import { createNewDiagram, newConnectorStyle, newDiagramTextDefaults, RENDER_DEFAULT_ARROWHEAD } from './newDiagram'

describe('defaults for new diagrams and connectors', () => {
  it('the render default arrowhead matches the canvas', () => {
    expect(RENDER_DEFAULT_ARROWHEAD).toBe(EDGE_DEFAULTS.endArrow)
  })

  it('a new connector stores no style when the setting is the render default', () => {
    expect(newConnectorStyle('arrow')).toEqual({})
    expect(newConnectorStyle('closed')).toEqual({ endArrow: 'closed' })
    expect(newConnectorStyle('none')).toEqual({ endArrow: 'none' })
  })

  it('connect applies the given style to the new edge only', () => {
    const diagram = {
      ...createNewDiagram(undefined, {}),
      nodes: [
        { id: 'a', type: 'rectangle', position: { x: 0, y: 0 }, size: { width: 100, height: 60 }, label: 'A' },
        { id: 'b', type: 'rectangle', position: { x: 200, y: 0 }, size: { width: 100, height: 60 }, label: 'B' },
      ],
    }
    const parsed = DiagramSchema.parse(diagram)
    const plain = connect(parsed, { source: 'a', target: 'b' })
    expect(plain.diagram.edges[0]?.style).toEqual({})
    const styled = connect(parsed, { source: 'a', target: 'b' }, undefined, { endArrow: 'closed' })
    expect(styled.diagram.edges[0]?.style).toEqual({ endArrow: 'closed' })
    expect(DiagramSchema.safeParse(styled.diagram).success).toBe(true)
  })

  it('new diagrams take text defaults from settings; none set means none stored', () => {
    expect(newDiagramTextDefaults({})).toBeUndefined()
    expect(newDiagramTextDefaults({ fontSize: 18 })).toEqual({ fontSize: 18 })
    expect(createNewDiagram(undefined, {}).textDefaults).toBeUndefined()
    const diagram = createNewDiagram('Mine', { fontFamily: 'serif', fontSize: 20 })
    expect(diagram.textDefaults).toEqual({ fontFamily: 'serif', fontSize: 20 })
    expect(DiagramSchema.safeParse(diagram).success).toBe(true)
  })

  it('a template keeps its own text defaults, else takes the settings ones', () => {
    const template = { name: 'T', diagram: createNewDiagram('T', {}) } as Parameters<typeof diagramFromTemplate>[0]
    expect(diagramFromTemplate(template, new Date(), { fontSize: 18 }).textDefaults).toEqual({ fontSize: 18 })
    const own = { ...template, diagram: { ...template.diagram, textDefaults: { fontSize: 12 } } }
    expect(diagramFromTemplate(own, new Date(), { fontSize: 18 }).textDefaults).toEqual({ fontSize: 12 })
  })
})
