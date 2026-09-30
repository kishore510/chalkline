import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fixtures } from '@/fixtures'
import { DiagramSchema } from '@/schema/diagram'
import { HISTORY_LIMIT, useDiagramStore } from './diagramStore'

const store = () => useDiagramStore.getState()
const label = (id: string) => store().diagram.nodes.find((n) => n.id === id)?.label

beforeEach(() => {
  vi.useRealTimers()
  store().load(fixtures['all-shapes'], { undoable: false })
})

describe('undo and redo', () => {
  it('undoes and redoes a single action', () => {
    const before = store().diagram
    store().setNodeLabel('n_rect', 'A')
    expect(store().canUndo).toBe(true)
    store().undo()
    expect(store().diagram).toBe(before)
    expect(store().canRedo).toBe(true)
    store().redo()
    expect(label('n_rect')).toBe('A')
  })

  it('does nothing with an empty history', () => {
    const before = store().diagram
    store().undo()
    store().redo()
    expect(store().diagram).toBe(before)
    expect(store().canUndo).toBe(false)
  })

  it('a new change clears the redo stack', () => {
    store().setNodeLabel('n_rect', 'A')
    store().undo()
    store().setNodeLabel('n_db', 'B')
    expect(store().canRedo).toBe(false)
  })

  it('merges rapid typing into one step, but not typing in different fields', () => {
    const before = store().diagram
    store().setNodeLabel('n_rect', 'H')
    store().setNodeLabel('n_rect', 'He')
    store().setNodeLabel('n_rect', 'Hey')
    store().setNodeLabel('n_db', 'X')
    store().undo()
    expect(label('n_rect')).toBe('Hey')
    store().undo()
    expect(store().diagram).toBe(before)
  })

  it('starts a new step after a pause in typing', () => {
    vi.useFakeTimers()
    store().setNodeLabel('n_rect', 'H')
    vi.advanceTimersByTime(5000)
    store().setNodeLabel('n_rect', 'Hi')
    store().undo()
    expect(label('n_rect')).toBe('H')
  })

  it('records a whole drag (a batch) as one step', () => {
    const before = store().diagram
    store().beginBatch()
    for (let x = 0; x < 50; x += 5) store().moveNodes(new Map([['n_rect', { x, y: 0 }]]))
    store().endBatch()
    store().undo()
    expect(store().diagram).toBe(before)
  })

  it('an empty batch records nothing', () => {
    store().beginBatch()
    store().endBatch()
    expect(store().canUndo).toBe(false)
  })

  it('automatic node growth joins the previous step instead of adding one', () => {
    const before = store().diagram
    store().setNodeLabel('n_rect', 'Long label')
    store().growNodeToFit('n_rect', 200)
    store().undo()
    expect(store().diagram).toBe(before)
  })

  it('undoes a delete, restoring nodes and edges, and prunes the selection', () => {
    const before = store().diagram
    store().setSelection(['n_round'])
    store().deleteSelection()
    store().undo()
    expect(store().diagram).toBe(before)
    store().setSelection(['n_round'])
    store().redo()
    expect(store().selection).toEqual([])
  })

  it('makes loading undoable when asked, and resets history otherwise', () => {
    const before = store().diagram
    store().load(fixtures['web-architecture'])
    store().undo()
    expect(store().diagram).toBe(before)
    store().setNodeLabel('n_rect', 'A')
    store().load(fixtures['empty'], { undoable: false })
    expect(store().canUndo).toBe(false)
  })

  it(`keeps at most ${HISTORY_LIMIT} steps`, () => {
    for (let i = 0; i < HISTORY_LIMIT + 20; i++) store().setTitle(`t${i}`)
    // Titles typed in one field merge, so use distinct actions:
    for (let i = 0; i < HISTORY_LIMIT + 20; i++) store().moveNodes(new Map([['n_rect', { x: i, y: i }]]))
    let steps = 0
    while (store().canUndo) {
      store().undo()
      steps++
    }
    expect(steps).toBe(HISTORY_LIMIT)
    expect(DiagramSchema.safeParse(store().diagram).success).toBe(true)
  })
})
