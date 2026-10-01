import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fixtures } from '@/fixtures'
import { parseDiagram } from '@/schema/diagram'
import { useSearchStore } from '@/search/searchStore'
import { useDiagramStore } from '@/store/diagramStore'
import { useUiStore } from '@/store/uiStore'
import { historyMessage, LOCKED_MESSAGE, searchMessage, selectionMessage, startAnnouncements, useAnnounceStore } from './announce'

const last = () => useAnnounceStore.getState().message?.text
const store = () => useDiagramStore.getState()

describe('messages', () => {
  const d = parseDiagram(fixtures.container)

  it('describe the selection', () => {
    expect(selectionMessage(d, [])).toBe('Selection cleared')
    expect(selectionMessage(d, ['n_orders'])).toBe('Orders, rounded box, selected')
    expect(selectionMessage(d, ['g_backend'])).toMatch(/, group, selected$/)
    expect(selectionMessage(d, ['n_orders', 'n_payments'])).toBe('2 shapes selected')
  })

  it('tell undo from redo, and ignore ordinary edits', () => {
    expect(historyMessage({ past: 3, future: 0 }, { past: 2, future: 1 })).toBe('Undone')
    expect(historyMessage({ past: 2, future: 1 }, { past: 3, future: 0 })).toBe('Redone')
    expect(historyMessage({ past: 2, future: 0 }, { past: 3, future: 0 })).toBeNull()
  })

  it('give the search count and current match', () => {
    expect(searchMessage(0, -1, undefined, 0)).toBe('No matches')
    expect(searchMessage(0, -1, undefined, 2)).toBe('No matches, 2 more on hidden layers')
    expect(searchMessage(12, 2, 'Orders', 0)).toBe('3 of 12: Orders')
  })

  it('has a short lock message', () => {
    expect(LOCKED_MESSAGE.length).toBeLessThan(40)
  })
})

describe('startAnnouncements', () => {
  let stop: () => void
  beforeEach(() => {
    store().load(fixtures.container, { undoable: false })
    useSearchStore.getState().close()
    useUiStore.getState().setTool('select')
    useAnnounceStore.setState({ message: null })
    stop = startAnnouncements()
  })
  afterEach(() => stop())

  it('announces selection changes and mode changes', () => {
    store().setSelection(['n_orders'])
    expect(last()).toBe('Orders, rounded box, selected')
    useUiStore.getState().setTool('pan')
    expect(last()).toBe('Pan mode')
  })

  it('announces undo and redo', () => {
    store().setNodeLabel('n_orders', 'Orders v2')
    store().undo()
    expect(last()).toBe('Undone')
    store().redo()
    expect(last()).toBe('Redone')
  })

  it('announces search results as they change', () => {
    useSearchStore.getState().openSearch()
    useSearchStore.getState().setQuery('o')
    expect(last()).toMatch(/^1 of \d+: /)
    useSearchStore.getState().next()
    expect(last()).toMatch(/^2 of \d+: /)
  })

  it('the same words can be announced twice (each has a new id)', () => {
    store().setSelection(['n_orders'])
    const first = useAnnounceStore.getState().message!
    store().setSelection([])
    store().setSelection(['n_orders'])
    expect(useAnnounceStore.getState().message!.text).toBe(first.text)
    expect(useAnnounceStore.getState().message!.id).toBeGreaterThan(first.id)
  })

  it('never touches the document or its history', () => {
    const before = store().diagram
    store().setSelection(['n_orders'])
    useUiStore.getState().setTool('link')
    expect(store().diagram).toBe(before)
    expect(store().past).toHaveLength(0)
  })
})
