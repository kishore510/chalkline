import { create } from 'zustand'
import { ancestors, groupById } from '@/store/groups'
import { useDiagramStore } from '@/store/diagramStore'
import { EMPTY_RESULT, searchDiagram, stepIndex, type SearchHit, type SearchResult } from './search'

/*
 * Find in the diagram: view state only. Never saved, never an undo step;
 * closing clears the query and the highlight. Results follow the diagram
 * while the search is open.
 */

interface SearchState {
  open: boolean
  query: string
  result: SearchResult
  /** The current result, or -1. */
  index: number
  /** Every visible match, for the quiet highlight. */
  matchIds: ReadonlySet<string>
  /** Bumped when the current result should be brought into view. */
  revealRequest: number
  /** Bumped to move focus to the search box (opening it again while open, e.g. Ctrl+F). */
  focusRequest: number
  openSearch: () => void
  close: () => void
  setQuery: (query: string) => void
  next: () => void
  previous: () => void
  /** Makes result `index` current. */
  goTo: (index: number) => void
  /** Shows the hidden layers that have matches. A layer view change, not an undo step. */
  showHiddenMatches: () => void
  /** Expands the collapsed groups hiding the current result (one undo step: it changes the document). */
  expandCurrent: () => void
}

const NONE: ReadonlySet<string> = new Set()

const withResult = (result: SearchResult, index: number) => ({ result, index, matchIds: result.hits.length ? new Set(result.hits.map((h) => h.id)) : NONE })

export const useSearchStore = create<SearchState>()((set, get) => {
  const run = (query: string) => searchDiagram(useDiagramStore.getState().diagram, query)
  const reveal = () => set((s) => ({ revealRequest: s.revealRequest + 1 }))

  return {
    open: false,
    query: '',
    result: EMPTY_RESULT,
    index: -1,
    matchIds: NONE,
    revealRequest: 0,
    focusRequest: 0,
    openSearch: () => set((s) => ({ open: true, focusRequest: s.focusRequest + 1 })),
    close: () => set({ open: false, query: '', ...withResult(EMPTY_RESULT, -1) }),
    setQuery(query) {
      const result = run(query)
      set({ query, ...withResult(result, result.hits.length ? 0 : -1) })
      if (result.hits.length) reveal()
    },
    next() {
      const { index, result } = get()
      set({ index: stepIndex(index, result.hits.length, 1) })
      if (result.hits.length) reveal()
    },
    previous() {
      const { index, result } = get()
      set({ index: stepIndex(index, result.hits.length, -1) })
      if (result.hits.length) reveal()
    },
    goTo(index) {
      if (index < 0 || index >= get().result.hits.length) return
      set({ index })
      reveal()
    },
    showHiddenMatches() {
      const diagram = useDiagramStore.getState()
      for (const id of get().result.hidden.layerIds) diagram.setLayerVisible(id, true)
    },
    expandCurrent() {
      const hit = currentHit(get())
      if (!hit?.collapsedIn) return
      const diagram = useDiagramStore.getState()
      const d = diagram.diagram
      const node = d.nodes.find((n) => n.id === hit.id)
      const group = groupById(d, node?.groupId)
      const collapsed = [group, ...ancestors(d, group)].filter((g) => g?.collapsed)
      diagram.beginBatch()
      for (const g of collapsed) if (g) diagram.setCollapsed(g.id, false)
      diagram.endBatch()
      reveal()
    },
  }
})

export const currentHit = (s: Pick<SearchState, 'result' | 'index'>): SearchHit | undefined => s.result.hits[s.index]

/** What to highlight and bring into view: the shape, or the collapsed group hiding it. */
export const currentTarget = (s: Pick<SearchState, 'result' | 'index'>): string | undefined => {
  const hit = currentHit(s)
  return hit ? (hit.collapsedIn ?? hit.id) : undefined
}

const sameResult = (a: SearchResult, b: SearchResult) =>
  a.hidden.count === b.hidden.count &&
  a.hidden.layerIds.join() === b.hidden.layerIds.join() &&
  a.hits.length === b.hits.length &&
  a.hits.every((h, i) => h.id === b.hits[i]?.id && h.field === b.hits[i]?.field && h.collapsedIn === b.hits[i]?.collapsedIn)

// While open, results follow edits, undo and layer changes; the current result is kept if it still matches.
useDiagramStore.subscribe((state, previous) => {
  if (state.diagram === previous.diagram) return
  const search = useSearchStore.getState()
  if (!search.open || !search.query.trim()) return
  const currentId = currentHit(search)?.id
  const result = searchDiagram(state.diagram, search.query)
  if (sameResult(result, search.result)) return
  const kept = currentId === undefined ? -1 : result.hits.findIndex((h) => h.id === currentId)
  useSearchStore.setState(withResult(result, kept >= 0 ? kept : result.hits.length ? Math.min(Math.max(search.index, 0), result.hits.length - 1) : -1))
})
