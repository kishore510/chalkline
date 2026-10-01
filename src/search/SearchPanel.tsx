import { ChevronDown, ChevronUp, Search, X } from 'lucide-react'
import { useEffect, useRef, useState, type RefObject } from 'react'
import { useCanvasActions } from '@/canvas/useCanvasActions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Panel } from '@/components/ui/panel'
import { useSheetFocus } from '@/components/ui/useSheetFocus'
import { cn } from '@/lib/utils'
import { useDiagramStore } from '@/store/diagramStore'
import type { SearchHit } from './search'
import { currentHit, currentTarget, useSearchStore } from './searchStore'

/*
 * Find in the diagram. Tablet and desktop: a compact bar at the top of the
 * canvas. Phone: a bottom sheet with the results listed. View state only.
 */

/** Typing waits this long before searching, so a fast typist doesn't search on every key. */
const DEBOUNCE_MS = 150
/** The phone list shows this many results; refine the search for more. */
const LIST_LIMIT = 100

/** Opens find. On a phone it's an item in the menu; elsewhere this button sits in the top bar. */
export function SearchButton({ className }: { className?: string }) {
  const open = useSearchStore((s) => s.open)
  const openSearch = useSearchStore((s) => s.openSearch)
  return (
    <Button variant="ghost" size="icon" aria-label="Find in diagram (Ctrl F)" title="Find in diagram (Ctrl F)" aria-pressed={open} onClick={openSearch} className={className}>
      <Search />
    </Button>
  )
}

/** The search box, the debounce, keyboard handling, and bringing the current result into view. */
function useSearchBox(coveredBelow: () => number | undefined) {
  const query = useSearchStore((s) => s.query)
  const setQuery = useSearchStore((s) => s.setQuery)
  const focusRequest = useSearchStore((s) => s.focusRequest)
  const revealRequest = useSearchStore((s) => s.revealRequest)
  const [text, setText] = useState(query)
  const inputRef = useRef<HTMLInputElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const actions = useCanvasActions()
  const covered = useRef(coveredBelow)
  useEffect(() => {
    covered.current = coveredBelow
  })

  useEffect(() => () => clearTimeout(timer.current), [])

  // Focus on open, and again on Ctrl+F while open.
  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [focusRequest])

  useEffect(() => {
    if (revealRequest === 0) return
    const target = currentTarget(useSearchStore.getState())
    if (target) actions.revealItem(target, covered.current())
  }, [revealRequest, actions])

  const change = (value: string) => {
    setText(value)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setQuery(value), DEBOUNCE_MS)
  }
  /** Runs a pending search now (Enter shouldn't wait for the debounce). */
  const flush = () => {
    clearTimeout(timer.current)
    if (text !== useSearchStore.getState().query) {
      setQuery(text)
      return true
    }
    return false
  }
  const clear = () => {
    clearTimeout(timer.current)
    setText('')
    setQuery('')
    inputRef.current?.focus()
  }
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const search = useSearchStore.getState()
    if (e.key === 'Enter') {
      e.preventDefault()
      if (flush()) return
      if (e.shiftKey) search.previous()
      else search.next()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      search.close()
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
      // Already here: select the text rather than opening the browser's find.
      e.preventDefault()
      inputRef.current?.select()
    }
  }

  return { text, change, clear, onKeyDown, inputRef }
}

function SearchInput({ box, autoFocus }: { box: ReturnType<typeof useSearchBox>; autoFocus?: boolean }) {
  return (
    <label className="relative block min-w-0 flex-1">
      <span className="sr-only">Find shapes by label or notes</span>
      <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-muted" />
      <Input
        ref={box.inputRef}
        type="text"
        inputMode="search"
        enterKeyHint="search"
        autoComplete="off"
        spellCheck={false}
        autoFocus={autoFocus}
        value={box.text}
        onChange={(e) => box.change(e.target.value)}
        onKeyDown={box.onKeyDown}
        placeholder="Find in diagram"
        className={cn('pl-9', box.text && 'pr-touch')}
      />
      {box.text && (
        <button
          type="button"
          aria-label="Clear search"
          title="Clear"
          onClick={box.clear}
          className="absolute top-0 right-0 flex size-touch items-center justify-center rounded-md text-text-muted hover:text-text"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      )}
    </label>
  )
}

/** "3 of 12", "No matches", plus the hidden-layer and collapsed-group notes with their actions. */
function SearchStatus({ className }: { className?: string }) {
  const query = useSearchStore((s) => s.query)
  const result = useSearchStore((s) => s.result)
  const index = useSearchStore((s) => s.index)
  const hit = useSearchStore(currentHit)
  const showHidden = useSearchStore((s) => s.showHiddenMatches)
  const expand = useSearchStore((s) => s.expandCurrent)
  const groupLabel = useDiagramStore((s) => (hit?.collapsedIn ? s.diagram.groups.find((g) => g.id === hit.collapsedIn)?.label : undefined))
  if (!query.trim()) return null
  const count = result.hits.length
  const hidden = result.hidden.count
  return (
    <div className={cn('flex flex-col text-sm', className)}>
      <p aria-live="polite" className="flex min-h-touch items-center text-text-muted tabular-nums">
        {count === 0 ? (hidden ? 'No visible matches' : 'No matches') : `${index + 1} of ${count}${hit?.field === 'notes' ? ' · in notes' : ''}`}
      </p>
      {hit?.collapsedIn && (
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate text-text-muted">Inside collapsed “{groupLabel || 'group'}”</span>
          <Button variant="secondary" onClick={expand} className="shrink-0">
            Expand
          </Button>
        </div>
      )}
      {hidden > 0 && (
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 text-text-muted">
            {hidden} more on hidden {result.hidden.layerIds.length === 1 ? 'layer' : 'layers'}
          </span>
          <Button variant="secondary" onClick={showHidden} className="shrink-0">
            Show
          </Button>
        </div>
      )}
    </div>
  )
}

function StepButtons() {
  const count = useSearchStore((s) => s.result.hits.length)
  const next = useSearchStore((s) => s.next)
  const previous = useSearchStore((s) => s.previous)
  return (
    <>
      <Button variant="ghost" size="icon" aria-label="Previous match (Shift Enter)" title="Previous (Shift Enter)" disabled={count === 0} onClick={previous}>
        <ChevronUp />
      </Button>
      <Button variant="ghost" size="icon" aria-label="Next match (Enter)" title="Next (Enter)" disabled={count === 0} onClick={next}>
        <ChevronDown />
      </Button>
    </>
  )
}

function CloseButton() {
  const close = useSearchStore((s) => s.close)
  return (
    <Button variant="ghost" size="icon" aria-label="Close search (Esc)" title="Close (Esc)" onClick={close}>
      <X />
    </Button>
  )
}

/** Tablet and desktop: a compact bar floating at the top of the canvas. */
export function SearchBar() {
  const open = useSearchStore((s) => s.open)
  if (!open) return null
  return <SearchBarBody />
}

function SearchBarBody() {
  const box = useSearchBox(() => undefined)
  const ref = useRef<HTMLDivElement>(null)
  // Escape closes; focus returns to whatever opened search.
  useSheetFocus(ref, true, () => useSearchStore.getState().close())
  return (
    <Panel ref={ref} role="search" aria-label="Find in diagram" className="pointer-events-auto flex w-(--cl-search-bar-width) max-w-full flex-col p-1 shadow-lg">
      <div className="flex items-center gap-1">
        <SearchInput box={box} />
        <StepButtons />
        <CloseButton />
      </div>
      <SearchStatus className="px-2" />
    </Panel>
  )
}

function hitLabel(hit: SearchHit, labels: ReadonlyMap<string, string>) {
  return labels.get(hit.id)?.trim() || 'Untitled shape'
}

/** Phone: a bottom sheet with the box, the count, next and previous, and the results to tap. */
export function SearchSheet() {
  const ref = useRef<HTMLElement>(null)
  const box = useSearchBox(() => ref.current?.getBoundingClientRect().top)
  useSheetFocus(ref, true, () => useSearchStore.getState().close())
  return (
    <section
      ref={ref}
      role="search"
      aria-label="Find in diagram"
      className="cl-safe-bottom pointer-events-auto flex max-h-(--cl-sheet-max-height) w-full flex-col rounded-t-lg border-t border-border bg-surface px-4 shadow-lg"
    >
      <div className="flex justify-center pt-2" aria-hidden="true">
        <div className="h-1 w-10 rounded-full bg-border-strong" />
      </div>
      <div className="flex items-center gap-1 pt-1">
        <SearchInput box={box} autoFocus />
        <CloseButton />
      </div>
      <div className="flex items-start gap-1">
        <SearchStatus className="min-w-0 flex-1" />
        <div className="ml-auto flex shrink-0">
          <StepButtons />
        </div>
      </div>
      <ResultList sheet={ref} />
    </section>
  )
}

function ResultList({ sheet }: { sheet: RefObject<HTMLElement | null> }) {
  const hits = useSearchStore((s) => s.result.hits)
  const index = useSearchStore((s) => s.index)
  const goTo = useSearchStore((s) => s.goTo)
  const nodes = useDiagramStore((s) => s.diagram.nodes)
  const labels = new Map(nodes.map((n) => [n.id, n.label]))
  const current = useRef<HTMLLIElement>(null)
  useEffect(() => {
    if (sheet.current) current.current?.scrollIntoView({ block: 'nearest' })
  }, [index, sheet])
  if (hits.length === 0) return null
  return (
    <ul aria-label="Matches" className="-mx-4 min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-2">
      {hits.slice(0, LIST_LIMIT).map((hit, i) => (
        <li key={hit.id} ref={i === index ? current : undefined}>
          <button
            type="button"
            aria-current={i === index ? 'true' : undefined}
            onClick={() => goTo(i)}
            className={cn('flex min-h-touch w-full items-center gap-2 rounded-md px-2 text-left text-sm text-text', i === index && 'bg-accent-subtle')}
          >
            <span className="min-w-0 flex-1 truncate">{hitLabel(hit, labels)}</span>
            {(hit.field === 'notes' || hit.collapsedIn) && (
              <span className="shrink-0 text-xs text-text-muted">{hit.collapsedIn ? 'collapsed' : 'in notes'}</span>
            )}
          </button>
        </li>
      ))}
      {hits.length > LIST_LIMIT && <li className="px-2 py-2 text-xs text-text-muted">{hits.length - LIST_LIMIT} more: type more to narrow the search.</li>}
    </ul>
  )
}
