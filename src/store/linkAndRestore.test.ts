import { beforeEach, describe, expect, it } from 'vitest'
import { fixtures } from '@/fixtures'
import { DiagramSchema } from '@/schema/diagram'
import { useDiagramStore } from './diagramStore'
import { useUiStore } from './uiStore'

const store = () => useDiagramStore.getState()
const ui = () => useUiStore.getState()
const expectValid = () => expect(DiagramSchema.safeParse(store().diagram).error?.issues ?? []).toEqual([])

beforeEach(() => {
  store().load(fixtures['all-shapes'])
  ui().setTool('select')
})

describe('linkNodes', () => {
  it('creates a floating edge with no handles', () => {
    const id = store().linkNodes('n_db', 'n_text')
    const edge = store().diagram.edges.find((e) => e.id === id)!
    expect(edge).toMatchObject({ source: 'n_db', target: 'n_text' })
    expect(edge).not.toHaveProperty('sourceHandle')
    expect(edge).not.toHaveProperty('targetHandle')
    expectValid()
  })

  it('refuses self-links and repeated floating links', () => {
    expect(store().linkNodes('n_db', 'n_db')).toBeNull()
    expect(store().linkNodes('n_db', 'n_text')).not.toBeNull()
    expect(store().linkNodes('n_db', 'n_text')).toBeNull()
  })
})

describe('link mode', () => {
  it('picks a source, then links to the target and stays in link mode', () => {
    ui().setTool('link')
    const before = store().diagram.edges.length
    expect(ui().linkTap('n_cloud')).toBe('source')
    expect(ui().linkSourceId).toBe('n_cloud')
    expect(ui().linkTap('n_text')).toBe('linked')
    expect(store().diagram.edges).toHaveLength(before + 1)
    expect(store().diagram.edges.at(-1)).toMatchObject({ source: 'n_cloud', target: 'n_text' })
    expect(ui().linkSourceId).toBeNull()
    expect(ui().tool).toBe('link')
    expectValid()
  })

  it('tapping the source again cancels it', () => {
    ui().setTool('link')
    ui().linkTap('n_cloud')
    expect(ui().linkTap('n_cloud')).toBe('cleared')
    expect(ui().linkSourceId).toBeNull()
  })

  it('reports a refused link and clears the source', () => {
    ui().setTool('link')
    store().linkNodes('n_db', 'n_text')
    ui().linkTap('n_db')
    expect(ui().linkTap('n_text')).toBe('refused')
    expect(ui().linkSourceId).toBeNull()
  })

  it('ignores taps outside link mode, and leaving link mode clears the source', () => {
    expect(ui().linkTap('n_db')).toBe('ignored')
    ui().setTool('link')
    ui().linkTap('n_db')
    ui().setTool('pan')
    expect(ui().linkSourceId).toBeNull()
  })

  it('clears the source if that node is deleted', () => {
    ui().setTool('link')
    ui().linkTap('n_db')
    store().deleteElements(['n_db'])
    expect(ui().linkTap('n_text')).toBe('source')
  })
})

describe('delete and restore', () => {
  it('remembers what a delete removed, including attached edges', () => {
    store().deleteElements(['n_round'])
    const deletion = store().lastDeletion!
    expect(deletion.nodes.map((n) => n.id)).toEqual(['n_round'])
    expect(deletion.edges.map((e) => e.id).sort()).toEqual(['e_1', 'e_2'])
  })

  it('restores the deleted nodes and their edges exactly, and selects them', () => {
    const original = store().diagram
    store().setSelection(['n_round', 'e_3'])
    store().deleteSelection()
    expect(store().diagram.nodes).toHaveLength(original.nodes.length - 1)
    store().restoreDeleted()
    const byId = <T extends { id: string }>(items: T[]) => [...items].sort((a, b) => a.id.localeCompare(b.id))
    expect(byId(store().diagram.nodes)).toEqual(byId(original.nodes))
    expect(byId(store().diagram.edges)).toEqual(byId(original.edges))
    expect(store().selection.sort()).toEqual(['e_1', 'e_2', 'e_3', 'n_round'])
    expect(store().lastDeletion).toBeNull()
    expectValid()
  })

  it('skips edges whose other end has since been deleted', () => {
    store().deleteElements(['n_round'])
    const restorable = store().lastDeletion
    store().deleteElements(['n_rect'])
    useDiagramStore.setState({ lastDeletion: restorable })
    store().restoreDeleted()
    expect(store().diagram.nodes.some((n) => n.id === 'n_round')).toBe(true)
    expect(store().diagram.edges.map((e) => e.id)).toEqual(['e_3', 'e_2'])
    expectValid()
  })

  it('does nothing without a deletion, and each delete replaces the last', () => {
    const before = store().diagram
    store().restoreDeleted()
    expect(store().diagram).toBe(before)
    store().deleteElements(['n_text'])
    const first = store().lastDeletion!.id
    store().deleteElements(['n_cloud'])
    expect(store().lastDeletion!.id).toBeGreaterThan(first)
    expect(store().lastDeletion!.nodes.map((n) => n.id)).toEqual(['n_cloud'])
  })

  it('a delete that removes nothing keeps the previous deletion', () => {
    store().deleteElements(['n_text'])
    const last = store().lastDeletion
    store().deleteElements(['ghost'])
    expect(store().lastDeletion).toBe(last)
  })

  it('dismissing forgets the deletion; loading clears it', () => {
    store().deleteElements(['n_text'])
    store().dismissDeletion()
    expect(store().lastDeletion).toBeNull()
    store().deleteElements(['n_cloud'])
    store().load(fixtures.empty)
    expect(store().lastDeletion).toBeNull()
  })
})
