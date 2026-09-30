import { describe, expect, it } from 'vitest'
import { fixtures } from '@/fixtures'
import { DiagramSchema, parseDiagram, type Diagram } from '@/schema/diagram'
import { resetEdgeStyles, resetNodeStyles, setEdgeLabel, setEdgeNotes, setNodeNotes, updateEdgeStyles, updateNodeStyles } from './ops'

const base = () => parseDiagram(fixtures['web-architecture'])
const valid = (d: Diagram) => expect(DiagramSchema.safeParse(d).error?.issues ?? []).toEqual([])
const node = (d: Diagram, id: string) => d.nodes.find((n) => n.id === id)!
const edge = (d: Diagram, id: string) => d.edges.find((e) => e.id === id)!

describe('node styles', () => {
  it('applies a patch to several nodes', () => {
    const d0 = base()
    const d = updateNodeStyles(d0, ['web', 'api'], { fill: 'token:swatch-blue-soft', fontSize: 18 })
    expect(node(d, 'web').style).toEqual({ fill: 'token:swatch-blue-soft', fontSize: 18 })
    expect(node(d, 'api').style).toEqual({ fill: 'token:swatch-blue-soft', fontSize: 18 })
    expect(node(d, 'cdn')).toBe(node(d0, 'cdn'))
    valid(d)
  })

  it('resets a single property with undefined, keeping the rest', () => {
    const d = updateNodeStyles(base(), ['db'], { stroke: undefined })
    expect(node(d, 'db').style).toEqual({ fill: 'token:accent-subtle' })
    valid(d)
  })

  it('keeps identity when nothing changes', () => {
    const d0 = base()
    expect(updateNodeStyles(d0, ['db'], { fill: 'token:accent-subtle' })).toBe(d0)
    expect(updateNodeStyles(d0, ['web'], { fill: undefined })).toBe(d0)
    expect(updateNodeStyles(d0, [], { fill: '#000000' })).toBe(d0)
  })

  it.each([
    ['a bad colour', { fill: 'red' }],
    ['too large a font', { fontSize: 200 }],
    ['a negative border', { strokeWidth: -1 }],
  ])('refuses %s', (_label, patch) => {
    const d0 = base()
    expect(updateNodeStyles(d0, ['web', 'db'], patch)).toBe(d0)
  })

  it('resets a whole style', () => {
    const d0 = base()
    const d = resetNodeStyles(d0, ['db', 'web'])
    expect(node(d, 'db').style).toEqual({})
    expect(node(d, 'web')).toBe(node(d0, 'web'))
    valid(d)
  })

  it('sets notes', () => {
    const d = setNodeNotes(base(), 'web', 'Serves the SPA.')
    expect(node(d, 'web').notes).toBe('Serves the SPA.')
    expect(setNodeNotes(d, 'web', 'Serves the SPA.')).toBe(d)
  })
})

describe('edge styles', () => {
  it('applies and validates a patch', () => {
    const d = updateEdgeStyles(base(), ['e_user_cdn'], { lineType: 'bezier', dashed: true, endArrow: 'closed', width: 3 })
    expect(edge(d, 'e_user_cdn').style).toEqual({ lineType: 'bezier', dashed: true, endArrow: 'closed', width: 3 })
    valid(d)
    expect(updateEdgeStyles(d, ['e_user_cdn'], { width: 40 })).toBe(d)
  })

  it('resets styles and sets label and notes', () => {
    let d = resetEdgeStyles(base(), ['e_api_db'])
    expect(edge(d, 'e_api_db').style).toEqual({})
    d = setEdgeLabel(d, 'e_web_api', 'REST')
    d = setEdgeNotes(d, 'e_web_api', 'JSON over HTTPS')
    expect(edge(d, 'e_web_api')).toMatchObject({ label: 'REST', notes: 'JSON over HTTPS' })
    valid(d)
  })
})
