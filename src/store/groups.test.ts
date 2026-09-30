import { beforeEach, describe, expect, it } from 'vitest'
import { fixtures } from '@/fixtures'
import { DiagramSchema, type Diagram, type DiagramGroup } from '@/schema/diagram'
import { useDiagramStore } from './diagramStore'
import { laneOrder, poolBody } from './groups'

const store = () => useDiagramStore.getState()
const node = (id: string) => store().diagram.nodes.find((n) => n.id === id)!
const group = (id: string) => store().diagram.groups.find((g) => g.id === id)
const valid = () => expect(DiagramSchema.safeParse(store().diagram).error?.issues ?? []).toEqual([])

/** Runs an action and checks it was exactly one undo step and left a valid diagram. */
function oneStep(action: () => void) {
  const before = store().diagram
  const depth = store().past.length
  action()
  valid()
  expect(store().diagram).not.toBe(before)
  expect(store().past.length).toBe(depth + 1)
  store().undo()
  expect(store().diagram).toBe(before)
  store().redo()
}

const contains = (g: DiagramGroup, box: { position: { x: number; y: number }; size: { width: number; height: number } }) =>
  box.position.x >= g.position.x &&
  box.position.y >= g.position.y &&
  box.position.x + box.size.width <= g.position.x + g.size.width &&
  box.position.y + box.size.height <= g.position.y + g.size.height

/** Lanes of a pool, in order, must exactly tile the pool's body. */
function expectTiled(d: Diagram, poolId: string) {
  const pool = d.groups.find((g) => g.id === poolId)!
  const body = poolBody(d, pool)
  const lanes = laneOrder(d, poolId)
  const horizontal = (pool.orientation ?? lanes[0]?.orientation) !== 'vertical'
  let cursor = horizontal ? body.y : body.x
  for (const lane of lanes) {
    if (horizontal) {
      expect(lane.position).toEqual({ x: body.x, y: cursor })
      expect(lane.size.width).toBe(body.width)
      cursor += lane.size.height
    } else {
      expect(lane.position).toEqual({ x: cursor, y: body.y })
      expect(lane.size.height).toBe(body.height)
      cursor += lane.size.width
    }
  }
  expect(cursor).toBe(horizontal ? body.y + body.height : body.x + body.width)
}

describe('group and ungroup', () => {
  beforeEach(() => store().load(fixtures['all-shapes'], { undoable: false }))

  it('wraps the selected nodes in a padded container with a header, as one step', () => {
    store().setSelection(['n_rect', 'n_round', 'e_1'])
    oneStep(() => {
      const id = store().groupSelection()
      expect(store().selection).toEqual([id])
    })
    const g = store().diagram.groups[0]!
    expect(g).toMatchObject({ kind: 'container', label: 'Group', locked: false })
    for (const id of ['n_rect', 'n_round']) {
      expect(node(id).groupId).toBe(g.id)
      expect(contains(g, node(id))).toBe(true)
    }
    // Header space above the members.
    expect(node('n_rect').position.y - g.position.y).toBeGreaterThanOrEqual(40)
  })

  it('ungroups, keeping members in place', () => {
    store().setSelection(['n_rect', 'n_round'])
    store().groupSelection()
    const id = store().diagram.groups[0]!.id
    const positions = store().diagram.nodes.map((n) => n.position)
    oneStep(() => store().ungroup(id))
    expect(store().diagram.groups).toEqual([])
    expect(store().diagram.nodes.map((n) => n.position)).toEqual(positions)
    expect(node('n_rect').groupId).toBeUndefined()
  })

  it('nests a new group inside the members’ shared container', () => {
    store().setSelection(['n_rect', 'n_round', 'n_db'])
    store().groupSelection()
    const outer = store().diagram.groups[0]!.id
    store().setSelection(['n_rect', 'n_round'])
    store().groupSelection()
    const inner = store().diagram.groups.find((g) => g.id !== outer)!
    expect(inner.parentId).toBe(outer)
    expect(node('n_rect').groupId).toBe(inner.id)
    expect(node('n_db').groupId).toBe(outer)
  })

  it('moving a group moves members and nested groups, as one step', () => {
    store().setSelection(['n_rect', 'n_round', 'n_db'])
    store().groupSelection()
    const outer = store().diagram.groups[0]!
    store().setSelection(['n_rect'])
    store().groupSelection()
    const inner = store().diagram.groups.find((g) => g.id !== outer.id)!
    const before = { rect: node('n_rect').position, db: node('n_db').position, inner: inner.position }
    oneStep(() => store().moveGroup(outer.id, { x: outer.position.x + 100, y: outer.position.y + 50 }))
    expect(node('n_rect').position).toEqual({ x: before.rect.x + 100, y: before.rect.y + 50 })
    expect(node('n_db').position).toEqual({ x: before.db.x + 100, y: before.db.y + 50 })
    expect(group(inner.id)!.position).toEqual({ x: before.inner.x + 100, y: before.inner.y + 50 })
    // Nodes outside the group don't move.
    expect(node('n_text').position).toEqual({ x: 400, y: 190 })
  })
})

describe('adopt and release', () => {
  beforeEach(() => store().load(fixtures.container, { undoable: false }))

  it('adopts a node whose centre is dropped inside a group, and releases it when dropped outside', () => {
    store().moveNodes(new Map([['n_client', { x: 200, y: 60 }]]))
    store().adoptDropped(['n_client'])
    expect(node('n_client').groupId).toBe('g_backend')
    store().moveNodes(new Map([['n_client', { x: 900, y: 60 }]]))
    store().adoptDropped(['n_client'])
    expect(node('n_client').groupId).toBeUndefined()
    valid()
  })

  it('a drag that moves and adopts is one undo step', () => {
    const before = store().diagram
    store().beginBatch()
    store().moveNodes(new Map([['n_client', { x: 200, y: 60 }]]))
    store().adoptDropped(['n_client'])
    store().endBatch()
    store().undo()
    expect(store().diagram).toBe(before)
  })

  it('"Remove from group" releases without any dragging', () => {
    oneStep(() => store().removeFromGroup(['n_orders']))
    expect(node('n_orders').groupId).toBeUndefined()
    expect(node('n_orders').position).toEqual({ x: 24, y: 80 })
  })

  it('finds the innermost group, so nodes dropped in a lane join the lane', () => {
    store().load(fixtures['swimlane-pool'], { undoable: false })
    store().moveNodes(new Map([['n_mobile', { x: 300, y: 360 }]]))
    store().adoptDropped(['n_mobile'])
    expect(node('n_mobile').groupId).toBe('g_lane_data')
  })
})

describe('resize limits', () => {
  beforeEach(() => store().load(fixtures.container, { undoable: false }))

  it('never moves or resizes members, and never shrinks below them plus padding', () => {
    const members = store().diagram.nodes.map((n) => ({ ...n.position, ...n.size }))
    oneStep(() => store().resizeGroup('g_backend', { x: 100, y: 50, width: 50, height: 50 }))
    const g = group('g_backend')!
    for (const id of ['n_orders', 'n_payments', 'n_store']) expect(contains(g, node(id))).toBe(true)
    expect(node('n_orders').position.x - g.position.x).toBeGreaterThanOrEqual(16)
    expect(store().diagram.nodes.map((n) => ({ ...n.position, ...n.size }))).toEqual(members)
  })

  it('grows freely', () => {
    store().resizeGroup('g_backend', { x: -50, y: -50, width: 800, height: 400 })
    expect(group('g_backend')).toMatchObject({ position: { x: -50, y: -50 }, size: { width: 800, height: 400 } })
  })
})

describe('collapse', () => {
  beforeEach(() => store().load(fixtures.container, { undoable: false }))

  it('round-trips without changing anything but the flag', () => {
    const before = store().diagram
    oneStep(() => store().setCollapsed('g_backend', true))
    expect(group('g_backend')!.collapsed).toBe(true)
    expect(group('g_backend')!.size).toEqual(before.groups[0]!.size)
    store().setCollapsed('g_backend', false)
    expect({ ...store().diagram, meta: before.meta }).toEqual(before)
  })
})

describe('swimlanes', () => {
  beforeEach(() => store().load(fixtures['swimlane-pool'], { undoable: false }))

  it('the fixture pool is tiled', () => {
    expectTiled(store().diagram, 'g_pool')
  })

  it('creates a pool with three generic lanes, horizontal or vertical', () => {
    store().load(fixtures.empty, { undoable: false })
    for (const orientation of ['horizontal', 'vertical'] as const) {
      const id = store().addPool({ x: 0, y: orientation === 'horizontal' ? 0 : 2000 }, orientation)!
      const lanes = laneOrder(store().diagram, id)
      expect(lanes.map((l) => l.label)).toEqual(['Lane 1', 'Lane 2', 'Lane 3'])
      expect(lanes.every((l) => l.orientation === orientation)).toBe(true)
      expectTiled(store().diagram, id)
    }
    valid()
  })

  it('adds a lane before or after, keeping the tiling and moving members with their lanes', () => {
    const ledger = node('n_ledger').position
    oneStep(() => store().addLane('g_lane_channels', 'after'))
    expectTiled(store().diagram, 'g_pool')
    expect(laneOrder(store().diagram, 'g_pool').map((l) => l.label)).toEqual(['Channels', 'Lane 4', 'Integration', 'Data'])
    const shift = laneOrder(store().diagram, 'g_pool')[1]!.size.height
    expect(node('n_ledger').position).toEqual({ x: ledger.x, y: ledger.y + shift })
    store().addLane('g_lane_channels', 'before')
    expect(laneOrder(store().diagram, 'g_pool')[0]!.id).not.toBe('g_lane_channels')
    expectTiled(store().diagram, 'g_pool')
  })

  it('deletes a lane, releasing its members to the pool', () => {
    oneStep(() => store().deleteLane('g_lane_integration'))
    expect(group('g_lane_integration')).toBeUndefined()
    expect(node('n_gateway').groupId).toBe('g_pool')
    expect(laneOrder(store().diagram, 'g_pool').map((l) => l.label)).toEqual(['Channels', 'Data'])
    expectTiled(store().diagram, 'g_pool')
  })

  it('reorders lanes with move up/down, members going with them', () => {
    const mobileY = node('n_mobile').position.y
    oneStep(() => store().moveLane('g_lane_channels', 1))
    expect(laneOrder(store().diagram, 'g_pool').map((l) => l.label)).toEqual(['Integration', 'Channels', 'Data'])
    expect(node('n_mobile').position.y).toBe(mobileY + 160)
    expect(node('n_gateway').groupId).toBe('g_lane_integration')
    expectTiled(store().diagram, 'g_pool')
    const before = store().diagram
    store().moveLane('g_lane_integration', -1)
    expect(store().diagram).toBe(before)
  })

  it('changes a lane’s thickness, growing the pool and shifting later lanes', () => {
    const pool = group('g_pool')!.size.height
    oneStep(() => store().setLaneThickness('g_lane_channels', 240))
    expect(group('g_lane_channels')!.size.height).toBe(240)
    expect(group('g_pool')!.size.height).toBe(pool + 80)
    expectTiled(store().diagram, 'g_pool')
  })

  it('won’t make a lane thinner than its members', () => {
    store().setLaneThickness('g_lane_data', 20)
    const lane = group('g_lane_data')!
    expect(contains(lane, node('n_accounts'))).toBe(true)
    expectTiled(store().diagram, 'g_pool')
  })

  it('resizing the pool keeps the lanes tiled', () => {
    const g = group('g_pool')!
    store().resizeGroup('g_pool', { ...g.position, width: g.size.width + 100, height: g.size.height + 60 })
    expectTiled(store().diagram, 'g_pool')
    expect(group('g_lane_data')!.size.height).toBe(220)
  })

  it('moving the pool moves lanes and all their members', () => {
    store().moveGroup('g_pool', { x: 100, y: 100 })
    expect(group('g_lane_data')!.position).toEqual({ x: 140, y: 420 })
    expect(node('n_ledger').position).toEqual({ x: 680, y: 450 })
    expectTiled(store().diagram, 'g_pool')
  })
})

describe('locking', () => {
  beforeEach(() => store().load(fixtures.container, { undoable: false }))

  it('a locked node cannot be moved, resized or deleted, but can be relabelled', () => {
    oneStep(() => store().setLocked(['n_client'], true))
    const before = node('n_client')
    store().moveNodes(new Map([['n_client', { x: 0, y: 0 }]]))
    store().resizeNode('n_client', { width: 300, height: 300 })
    store().deleteElements(['n_client'])
    expect(node('n_client')).toEqual(before)
    store().setNodeLabel('n_client', 'Customer')
    expect(node('n_client').label).toBe('Customer')
  })

  it('align, distribute and match size skip locked nodes and report them', () => {
    store().setLocked(['n_orders'], true)
    store().setSelection(['n_orders', 'n_payments', 'n_store'])
    const orders = node('n_orders').position
    expect(store().alignSelection('top')).toEqual({ skipped: 1, hidden: 0 })
    expect(node('n_orders').position).toEqual(orders)
    expect(node('n_payments').position.y).toBe(node('n_store').position.y)
    expect(store().matchSizeSelection('both').skipped).toBe(1)
  })

  it('a locked group cannot be moved, resized or deleted, and its members count as locked', () => {
    store().setLocked(['g_backend'], true)
    const before = store().diagram
    store().moveGroup('g_backend', { x: 500, y: 500 })
    store().resizeGroup('g_backend', { x: 0, y: 0, width: 2000, height: 2000 })
    store().deleteElements(['g_backend', 'n_orders'])
    store().moveNodes(new Map([['n_orders', { x: 0, y: 0 }]]))
    expect(store().diagram).toBe(before)
    // Derived, not stored on the members.
    expect(node('n_orders').locked).toBe(false)
    store().setLocked(['g_backend'], false)
    store().moveNodes(new Map([['n_orders', { x: 0, y: 0 }]]))
    expect(node('n_orders').position).toEqual({ x: 0, y: 0 })
  })
})

describe('deleting groups', () => {
  beforeEach(() => store().load(fixtures.container, { undoable: false }))

  it('deleting a group ungroups it: members survive', () => {
    oneStep(() => store().deleteElements(['g_backend']))
    expect(store().diagram.groups).toEqual([])
    expect(store().diagram.nodes).toHaveLength(4)
    expect(store().diagram.edges).toHaveLength(3)
  })

  it('"Delete group and contents" removes members and their connectors, undoably', () => {
    oneStep(() => store().deleteGroupsWithContents(['g_backend']))
    // Undo/redo in oneStep clears the toast state; delete again for the toast checks.
    store().undo()
    store().deleteGroupsWithContents(['g_backend'])
    expect(store().diagram.groups).toEqual([])
    expect(store().diagram.nodes.map((n) => n.id)).toEqual(['n_client'])
    expect(store().diagram.edges).toEqual([])
    expect(store().lastDeletion?.nodes).toHaveLength(3)
    expect(store().lastDeletion?.groups).toHaveLength(1)
    store().undoDeletion()
    expect(store().diagram.groups).toHaveLength(1)
    expect(store().diagram.nodes).toHaveLength(4)
  })

  it('deleting a pool with contents removes its lanes too', () => {
    store().load(fixtures['swimlane-pool'], { undoable: false })
    store().deleteGroupsWithContents(['g_pool'])
    expect(store().diagram.groups).toEqual([])
    expect(store().diagram.nodes).toEqual([])
    valid()
  })

  it('ungrouping a pool releases its lanes’ members', () => {
    store().load(fixtures['swimlane-pool'], { undoable: false })
    store().deleteElements(['g_pool'])
    expect(store().diagram.groups).toEqual([])
    expect(store().diagram.nodes).toHaveLength(6)
    expect(store().diagram.nodes.every((n) => n.groupId === undefined)).toBe(true)
    valid()
  })
})

describe('copy and paste groups', () => {
  it('copies a pool with its lanes, members and internal connectors, remapping every id', () => {
    store().load(fixtures['swimlane-pool'], { undoable: false })
    useDiagramStore.setState({ clipboard: null })
    store().setSelection(['g_pool'])
    store().copySelection()
    oneStep(() => store().paste())
    store().undo()
    const pasted = new Set(store().paste())
    const d = store().diagram
    expect(d.groups).toHaveLength(8)
    expect(d.nodes).toHaveLength(12)
    expect(d.edges).toHaveLength(10)
    const newPool = d.groups.find((g) => pasted.has(g.id) && g.kind === 'container')!
    const newLanes = d.groups.filter((g) => g.parentId === newPool.id)
    expect(newLanes).toHaveLength(3)
    for (const n of d.nodes.filter((n) => pasted.has(n.id))) {
      expect(newLanes.map((l) => l.id)).toContain(n.groupId)
    }
    expect(d.groups.filter((g) => g.parentId === 'g_pool')).toHaveLength(3)
  })

  it('duplicates a container with its members', () => {
    store().load(fixtures.container, { undoable: false })
    store().setSelection(['g_backend'])
    const ids = store().duplicateSelection()
    const d = store().diagram
    const copy = d.groups.find((g) => ids.includes(g.id))!
    expect(d.nodes.filter((n) => n.groupId === copy.id)).toHaveLength(3)
    expect(d.edges).toHaveLength(5)
    valid()
  })
})
