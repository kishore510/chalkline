import { beforeEach, describe, expect, it } from 'vitest'
import { fixtures, invalidFixtures } from '@/fixtures'
import { DiagramSchema } from '@/schema/diagram'
import { MIN_NODE_SIZE } from '@/schema/factories'
import { SHAPE_IDS } from '@/shapes/registry'
import { useDiagramStore } from './diagramStore'

const store = () => useDiagramStore.getState()
const expectValid = () => expect(DiagramSchema.safeParse(store().diagram).error?.issues ?? []).toEqual([])

beforeEach(() => store().reset())

describe('diagram store', () => {
  it('starts with a valid empty diagram', () => {
    expect(store().diagram.nodes).toEqual([])
    expectValid()
  })

  it('adds a node centred on a point and selects it', () => {
    const id = store().addNode('rectangle', { x: 0, y: 0 })
    const node = store().diagram.nodes[0]!
    expect(node).toMatchObject({ id, type: 'rectangle', position: { x: -80, y: -40 } })
    expect(store().selection).toEqual([id])
    expectValid()
  })

  it('keeps the document valid through a long sequence of edits', () => {
    const ids = SHAPE_IDS.map((type, i) => store().addNode(type, { x: i * 200, y: 0 }, 20))
    for (let i = 0; i < ids.length - 1; i++) {
      store().connect({ source: ids[i]!, target: ids[i + 1]!, sourceHandle: 'right', targetHandle: 'left' })
    }
    store().moveNodes(new Map([[ids[0]!, { x: 500, y: 500 }]]))
    store().resizeNode(ids[1]!, { width: 0, height: -5 })
    store().setNodeLabel(ids[2]!, 'Renamed')
    store().setTitle('My diagram')
    store().deleteElements([ids[3]!])
    expectValid()
    const resized = store().diagram.nodes.find((n) => n.id === ids[1])!
    expect(resized.size).toEqual({ width: MIN_NODE_SIZE, height: MIN_NODE_SIZE })
    expect(store().diagram.edges).toHaveLength(3)
  })

  it('stamps updated only when something changes', () => {
    store().load(fixtures['all-shapes'])
    const before = store().diagram
    store().setNodeLabel('n_rect', before.nodes[0]!.label)
    store().moveNodes(new Map())
    expect(store().diagram).toBe(before)
    store().setNodeLabel('n_rect', 'Changed')
    expect(store().diagram.meta.updated).not.toBe(before.meta.updated)
  })

  it('deletes the selection and prunes it', () => {
    store().load(fixtures['all-shapes'])
    store().setSelection(['n_round', 'e_3', 'ghost', 'n_round'])
    expect(store().selection).toEqual(['n_round', 'e_3'])
    store().deleteSelection()
    expect(store().selection).toEqual([])
    expect(store().diagram.edges).toEqual([])
    expectValid()
  })

  it('keeps selection when an unrelated element is deleted', () => {
    store().load(fixtures['all-shapes'])
    store().setSelection(['n_text'])
    store().deleteElements(['e_1'])
    expect(store().selection).toEqual(['n_text'])
  })

  it('rejects an invalid document without replacing the current one', () => {
    store().load(fixtures['web-architecture'])
    const before = store().diagram
    expect(() => store().load(invalidFixtures['invalid-dangling-edge'])).toThrow()
    expect(store().diagram).toBe(before)
  })

  it('styles, labels and annotates while staying valid', () => {
    store().load(fixtures['web-architecture'])
    store().updateNodeStyles(['web', 'api'], { fill: 'token:swatch-teal-soft', stroke: '#35701a', strokeWidth: 0 })
    store().updateNodeStyles(['web'], { fill: 'not a colour' })
    store().setNodeNotes('web', 'Front end')
    store().updateEdgeStyles(['e_web_api'], { dashed: true, startArrow: 'closed' })
    store().setEdgeLabel('e_web_api', 'HTTPS')
    store().setEdgeNotes('e_web_api', 'Behind the load balancer')
    store().resetNodeStyles(['api'])
    store().resetEdgeStyles(['e_api_db'])
    expectValid()
    const { nodes, edges } = store().diagram
    expect(nodes.find((n) => n.id === 'web')).toMatchObject({ notes: 'Front end', style: { fill: 'token:swatch-teal-soft', strokeWidth: 0 } })
    expect(nodes.find((n) => n.id === 'api')!.style).toEqual({})
    expect(edges.find((e) => e.id === 'e_web_api')).toMatchObject({ label: 'HTTPS', style: { dashed: true, startArrow: 'closed' } })
    expect(edges.find((e) => e.id === 'e_api_db')!.style).toEqual({})
  })

  it('returns null for a refused connection', () => {
    store().load(fixtures['all-shapes'])
    expect(store().connect({ source: 'n_db', target: 'n_db' })).toBeNull()
  })
})
