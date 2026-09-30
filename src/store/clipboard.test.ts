import { beforeEach, describe, expect, it } from 'vitest'
import { fixtures } from '@/fixtures'
import { DiagramSchema, parseDiagram } from '@/schema/diagram'
import { useDiagramStore } from './diagramStore'
import { copyFragment, parseFragment, pasteFragment, serializeFragment } from './clipboard'

const store = () => useDiagramStore.getState()
const valid = () => expect(DiagramSchema.safeParse(store().diagram).error?.issues ?? []).toEqual([])

describe('fragments', () => {
  const d = parseDiagram(fixtures['all-shapes'])

  it('copies selected nodes plus the edges between them', () => {
    const f = copyFragment(d, ['n_rect', 'n_round'])!
    expect(f.nodes.map((n) => n.id)).toEqual(['n_rect', 'n_round'])
    expect(f.edges.map((e) => e.id)).toEqual(['e_1'])
  })

  it('pastes with fresh ids, remapped edges and an offset', () => {
    const f = copyFragment(d, ['n_rect', 'n_round'])!
    const { diagram, ids } = pasteFragment(d, f, { x: 24, y: 24 })
    expect(ids).toHaveLength(3)
    const pasted = diagram.nodes.filter((n) => ids.includes(n.id))
    expect(pasted.map((n) => n.position)).toEqual([{ x: 24, y: 24 }, { x: 244, y: 24 }])
    const edge = diagram.edges.find((e) => ids.includes(e.id))!
    expect(ids).toContain(edge.source)
    expect(ids).toContain(edge.target)
    expect(DiagramSchema.safeParse(diagram).success).toBe(true)
  })

  it('round-trips through clipboard text and rejects junk', () => {
    const f = copyFragment(d, ['n_db'])!
    expect(parseFragment(serializeFragment(f))).toEqual(f)
    expect(parseFragment('hello')).toBeNull()
    expect(parseFragment('{"chalkline":"fragment","version":1,"nodes":[{"id":1}],"edges":[]}')).toBeNull()
    expect(parseFragment(JSON.stringify({ chalkline: 'other' }))).toBeNull()
  })

  it('drops edges whose ends are missing from the fragment', () => {
    const f = { nodes: copyFragment(d, ['n_rect'])!.nodes, edges: d.edges, groups: [] }
    expect(pasteFragment(d, f, { x: 0, y: 0 }).ids).toHaveLength(1)
  })
})

describe('store copy, paste, duplicate', () => {
  beforeEach(() => {
    store().load(fixtures['all-shapes'], { undoable: false })
    // The clipboard deliberately survives loading another diagram; start each test empty.
    useDiagramStore.setState({ clipboard: null })
  })

  it('copies the selection and pastes it offset, selecting the copy', () => {
    store().setSelection(['n_rect', 'n_round'])
    expect(store().copySelection()).not.toBeNull()
    const pasted = store().paste()
    expect(pasted).toHaveLength(3)
    expect(store().selection).toEqual(pasted)
    expect(store().diagram.nodes).toHaveLength(8)
    valid()
  })

  it('pastes repeatedly at growing offsets', () => {
    store().setSelection(['n_db'])
    store().copySelection()
    const a = store().paste()[0]!
    const b = store().paste()[0]!
    const pos = (id: string) => store().diagram.nodes.find((n) => n.id === id)!.position
    expect(pos(b).x).toBeGreaterThan(pos(a).x)
  })

  it('pastes centred on a point', () => {
    store().setSelection(['n_rect'])
    store().copySelection()
    const [id] = store().paste({ x: 1000, y: 1000 })
    const node = store().diagram.nodes.find((n) => n.id === id)!
    expect(node.position).toEqual({ x: 1000 - 80, y: 1000 - 40 })
  })

  it('duplicates without touching the clipboard, as one undo step', () => {
    const before = store().diagram
    store().setSelection(['n_cloud'])
    const ids = store().duplicateSelection()
    expect(ids).toHaveLength(1)
    expect(store().clipboard).toBeNull()
    store().undo()
    expect(store().diagram).toBe(before)
  })

  it('cut copies and deletes', () => {
    store().setSelection(['n_text'])
    store().cutSelection()
    expect(store().diagram.nodes.some((n) => n.id === 'n_text')).toBe(false)
    expect(store().paste()).toHaveLength(1)
    valid()
  })

  it('does nothing with an empty selection or clipboard', () => {
    const before = store().diagram
    expect(store().copySelection()).toBeNull()
    expect(store().paste()).toEqual([])
    expect(store().duplicateSelection()).toEqual([])
    expect(store().diagram).toBe(before)
  })
})
