import { beforeEach, describe, expect, it } from 'vitest'
import { fixtures } from '@/fixtures'
import { DiagramSchema, MAX_LAYERS } from '@/schema/diagram'
import { useDiagramStore } from './diagramStore'

const store = () => useDiagramStore.getState()
const node = (id: string) => store().diagram.nodes.find((n) => n.id === id)
const layer = (id: string) => store().diagram.layers.find((l) => l.id === id)
const valid = () => expect(DiagramSchema.safeParse(store().diagram).error?.issues ?? []).toEqual([])

/** Runs an action and checks it made exactly `steps` undo steps and left a valid diagram. */
function steps(count: number, action: () => void) {
  const before = store().past.length
  action()
  valid()
  expect(store().past.length - before).toBe(count)
}

beforeEach(() => {
  store().load(fixtures.layers, { undoable: false })
  store().setActiveLayer('default')
})

describe('visibility and locking', () => {
  it('hiding a layer deselects its items; hidden items cannot be selected', () => {
    store().setSelection(['n_firewall', 'n_client'])
    steps(0, () => store().setLayerVisible('l_security', false))
    expect(store().selection).toEqual(['n_client'])
    store().setSelection(['n_firewall', 'e_firewall_api', 'n_note'])
    expect(store().selection).toEqual([])
  })

  it('visibility and lock toggles are saved but are not undo steps, and undo leaves them alone', () => {
    steps(1, () => store().renameLayer('l_security', 'Security'))
    steps(0, () => store().setLayerVisible('l_security', false))
    steps(0, () => store().setLayerLocked('default', true))
    store().undo()
    expect(layer('l_security')).toMatchObject({ name: 'Security overlay', visible: false })
    expect(layer('default')!.locked).toBe(true)
    store().redo()
    expect(layer('l_security')).toMatchObject({ name: 'Security', visible: false })
  })

  it('show all and solo', () => {
    store().soloLayer('l_notes')
    expect(store().diagram.layers.map((l) => l.visible)).toEqual([false, false, true])
    store().showAllLayers()
    expect(store().diagram.layers.every((l) => l.visible)).toBe(true)
  })
})

describe('the active layer', () => {
  it('new nodes, connectors, groups and pastes go on the active layer', () => {
    store().setActiveLayer('l_security')
    const id = store().addNode('rectangle', { x: 900, y: 900 })!
    expect(node(id)!.layerId).toBe('l_security')
    const edgeId = store().linkNodes(id, 'n_client')!
    expect(store().diagram.edges.find((e) => e.id === edgeId)!.layerId).toBe('l_security')
    store().setSelection([id])
    const groupId = store().groupSelection()!
    expect(store().diagram.groups.find((g) => g.id === groupId)!.layerId).toBe('l_security')
    store().setActiveLayer('default')
    store().setSelection(['n_firewall'])
    store().copySelection()
    const [pasted] = store().paste()
    expect(node(pasted!)!.layerId).toBeUndefined()
    valid()
  })

  it('duplicate keeps each item’s own layer', () => {
    store().setSelection(['n_firewall', 'n_client'])
    const ids = store().duplicateSelection()
    const copies = store().diagram.nodes.filter((n) => ids.includes(n.id))
    expect(copies.map((n) => n.layerId ?? 'default').sort()).toEqual(['default', 'l_security'])
  })

  it('blocks adding while the active layer is hidden or locked', () => {
    store().setActiveLayer('l_notes')
    const before = store().diagram
    expect(store().addNode('rectangle', { x: 0, y: 0 })).toBeNull()
    expect(store().linkNodes('n_client', 'n_db')).toBeNull()
    expect(store().diagram).toBe(before)
    expect(store().activeLayerProblem()).toBe('hidden')
    store().setLayerVisible('l_notes', true)
    store().setLayerLocked('l_notes', true)
    // Locking the active layer switches away from it; choosing it again shows why adding is blocked.
    store().setActiveLayer('l_notes')
    expect(store().activeLayerProblem()).toBe('locked')
    expect(store().addNode('rectangle', { x: 0, y: 0 })).toBeNull()
  })

  it('switches to the nearest usable layer when the active one is hidden or locked', () => {
    store().setActiveLayer('l_security')
    expect(store().setLayerVisible('l_security', false)).toEqual({ switchedTo: 'default' })
    expect(store().activeLayerId).toBe('default')
    store().setLayerVisible('l_security', true)
    store().setLayerVisible('l_notes', true)
    store().setActiveLayer('l_notes')
    store().setLayerLocked('l_notes', true)
    expect(store().activeLayerId).toBe('l_security')
  })

  it('reports when no layer is usable', () => {
    for (const l of store().diagram.layers) store().setLayerLocked(l.id, true)
    expect(store().activeLayerProblem()).toBe('locked')
  })
})

describe('layer edits', () => {
  it('adds, renames and reorders layers as undo steps', () => {
    let id = ''
    steps(1, () => (id = store().addLayer('Flows')!))
    expect(store().diagram.layers.at(-1)).toMatchObject({ id, name: 'Flows', visible: true, locked: false })
    expect(store().activeLayerId).toBe(id)
    steps(1, () => store().moveLayer(id, -1))
    expect(store().diagram.layers.map((l) => l.name)).toEqual(['Base', 'Security overlay', 'Flows', 'Notes'])
    steps(0, () => store().moveLayer('default', -1))
  })

  it(`stops at ${MAX_LAYERS} layers`, () => {
    for (let i = 3; i < MAX_LAYERS; i++) store().addLayer(`L${i}`)
    expect(store().diagram.layers).toHaveLength(MAX_LAYERS)
    expect(store().addLayer('One too many')).toBeNull()
  })

  it('moves the selection to a layer as one step, skipping locked items', () => {
    store().setLayerLocked('l_security', true)
    store().setSelection(['n_client', 'n_firewall', 'e_client_api', 'g_zone'])
    let result = { moved: 0, skipped: 0 }
    steps(1, () => (result = store().moveSelectionToLayer('l_notes')))
    expect(result).toEqual({ moved: 2, skipped: 2 })
    expect(node('n_client')!.layerId).toBe('l_notes')
    expect(node('n_firewall')!.layerId).toBe('l_security')
  })

  it('deleting a layer moves its items to another layer (Base by default), as one step', () => {
    steps(1, () => store().deleteLayer('l_security'))
    expect(layer('l_security')).toBeUndefined()
    expect(node('n_firewall')!.layerId).toBeUndefined()
    expect(store().diagram.groups[0]!.layerId).toBeUndefined()
    store().undo()
    store().deleteLayer('l_security', 'l_notes')
    expect(node('n_firewall')!.layerId).toBe('l_notes')
  })

  it('never deletes the default layer', () => {
    const before = store().diagram
    store().deleteLayer('default')
    store().deleteLayerWithContents('default')
    expect(store().diagram).toBe(before)
  })

  it('"Delete layer and contents" removes its items and their connectors, undoably', () => {
    steps(1, () => store().deleteLayerWithContents('l_security'))
    expect(node('n_firewall')).toBeUndefined()
    expect(store().diagram.edges.find((e) => e.id === 'e_firewall_api')).toBeUndefined()
    // The group frame goes; its members (on Base) stay, released.
    expect(store().diagram.groups).toEqual([])
    expect(node('n_api')!.groupId).toBeUndefined()
    expect(store().lastDeletion?.nodes.map((n) => n.id)).toEqual(['n_firewall'])
    store().undoDeletion()
    expect(node('n_firewall')).toBeDefined()
  })
})

describe('other tools skip hidden and locked items', () => {
  it('align reports hidden and locked shapes it skipped', () => {
    store().setLayerLocked('l_security', true)
    store().setSelection(['n_client', 'n_firewall', 'n_db'])
    const firewall = node('n_firewall')!.position
    expect(store().alignSelection('top')).toEqual({ skipped: 1, hidden: 0 })
    expect(node('n_firewall')!.position).toEqual(firewall)
    expect(node('n_client')!.position.y).toBe(node('n_db')!.position.y)
  })

  it('tidy connectors leaves hidden and locked connectors alone', () => {
    store().load(fixtures.layers, { undoable: false })
    // Pin every connector, then hide one layer and lock another.
    store().setEdgeSides(store().diagram.edges.map((e) => e.id), { source: 'right' })
    store().setLayerVisible('l_notes', false)
    store().setLayerLocked('l_security', true)
    expect(store().tidyConnectors({ clearPinned: true })).toEqual({ cleared: 2, skipped: 2 })
    expect(store().diagram.edges.find((e) => e.id === 'e_firewall_api')!.sourceHandle).toBe('right')
  })
})
