import { beforeEach, describe, expect, it } from 'vitest'
import { fixtures } from '@/fixtures'
import { DiagramSchema, parseDiagram } from '@/schema/diagram'
import { useDiagramStore } from './diagramStore'
import { updateGroupStyles } from './ops'

const store = () => useDiagramStore.getState()
const group = (id: string) => store().diagram.groups.find((g) => g.id === id)!
const valid = () => expect(DiagramSchema.safeParse(store().diagram).error?.issues ?? []).toEqual([])

const FILL = 'token:swatch-amber-soft'
const STROKE = 'token:swatch-amber'

describe('updateGroupStyles (op)', () => {
  const base = () => parseDiagram(fixtures['swimlane-pool'])

  it('patches only the given groups and keeps identity when nothing changes', () => {
    const d0 = base()
    const d = updateGroupStyles(d0, ['g_lane_data'], { fill: FILL })
    expect(d.groups.find((g) => g.id === 'g_lane_data')!.style).toEqual({ fill: FILL })
    expect(d.groups.find((g) => g.id === 'g_pool')).toBe(d0.groups.find((g) => g.id === 'g_pool'))
    expect(updateGroupStyles(d0, ['g_lane_data'], { fill: undefined })).toBe(d0)
    expect(updateGroupStyles(d0, [], { fill: FILL })).toBe(d0)
  })

  it('refuses a value the schema rejects', () => {
    const d0 = base()
    expect(updateGroupStyles(d0, ['g_pool'], { fill: 'yellow' })).toBe(d0)
  })
})

describe('group fill and border (store)', () => {
  beforeEach(() => store().load(fixtures['swimlane-pool'], { undoable: false }))

  it('sets fill and border, each as one undo step', () => {
    const before = store().diagram
    store().updateGroupStyles(['g_pool'], { fill: FILL })
    valid()
    expect(group('g_pool').style).toEqual({ fill: FILL })
    expect(store().past).toHaveLength(1)
    store().undo()
    expect(store().diagram).toBe(before)
    store().redo()
    store().updateGroupStyles(['g_pool'], { stroke: STROKE })
    expect(group('g_pool').style).toEqual({ fill: FILL, stroke: STROKE })
    expect(store().past).toHaveLength(2)
  })

  it('resets each colour to the default, keeping the other', () => {
    store().updateGroupStyles(['g_pool'], { fill: FILL, stroke: STROKE })
    store().updateGroupStyles(['g_pool'], { fill: undefined })
    expect(group('g_pool').style).toEqual({ stroke: STROKE })
    store().updateGroupStyles(['g_pool'], { stroke: undefined })
    expect(group('g_pool').style).toEqual({})
    valid()
  })

  it('reset to default clears fill and border together as one step', () => {
    store().updateGroupStyles(['g_pool'], { fill: FILL, stroke: STROKE, fontSize: 18 })
    const depth = store().past.length
    store().updateGroupStyles(['g_pool'], { fill: undefined, stroke: undefined })
    expect(group('g_pool').style).toEqual({ fontSize: 18 })
    expect(store().past).toHaveLength(depth + 1)
  })

  it('edits every selected group (pool and lanes) in one step', () => {
    const ids = ['g_lane_channels', 'g_lane_integration', 'g_lane_data']
    const before = store().diagram
    store().updateGroupStyles(ids, { fill: FILL })
    for (const id of ids) expect(group(id).style.fill).toBe(FILL)
    expect(store().past).toHaveLength(1)
    store().undo()
    expect(store().diagram).toBe(before)
  })

  it('refuses locked groups, and groups inside a locked group, but edits the rest', () => {
    store().setLocked(['g_pool'], true)
    const depth = store().past.length
    const before = store().diagram
    store().updateGroupStyles(['g_pool', 'g_lane_data'], { fill: FILL })
    expect(store().diagram).toBe(before)
    expect(store().past).toHaveLength(depth)

    store().setLocked(['g_pool'], false)
    store().setLocked(['g_lane_data'], true)
    store().updateGroupStyles(['g_lane_data', 'g_lane_channels'], { fill: FILL })
    expect(group('g_lane_data').style.fill).toBeUndefined()
    expect(group('g_lane_channels').style.fill).toBe(FILL)
    valid()
  })

  it('refuses groups on a locked layer', () => {
    const layer = store().diagram.layers[0]!.id
    store().setLayerLocked(layer, true)
    const before = store().diagram
    store().updateGroupStyles(['g_pool'], { fill: FILL })
    expect(store().diagram).toBe(before)
  })
})
