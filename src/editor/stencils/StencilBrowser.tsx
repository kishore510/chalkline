import { Copy, Download, EllipsisVertical, FileDown, Pencil, Search, Tags, Trash2, Upload } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useCanvasActions } from '@/canvas/useCanvasActions'
import { Button } from '@/components/ui/button'
import { Panel } from '@/components/ui/panel'
import { cn } from '@/lib/utils'
import { BUILTIN_STENCILS } from '@/stencils/builtin'
import type { Stencil } from '@/stencils/format'
import { categoriesOf, searchItems } from '@/stencils/search'
import { builtinThumbnail, useStencilStore } from '@/stencils/stencilStore'
import { deleteStencil, duplicateStencil, exportLibrary, exportStencil, importStencilFile } from './actions'
import { CategoryChips } from './CategoryChips'
import { Thumbnail } from './Thumbnail'

type Tab = 'mine' | 'builtin'

/** One stencil ready to show: its data, preview and whether it can be edited. */
interface Item {
  id: string
  name: string
  category: string
  tags: readonly string[]
  stencil: Stencil
  thumbnail: string
  builtin: boolean
}

const BUILTIN_ITEMS: Item[] = BUILTIN_STENCILS.map((s) => ({ ...s, stencil: s, builtin: true, get thumbnail() { return builtinThumbnail(s.id) } }))

function useItems(): { mine: Item[]; all: Map<string, Item> } {
  const records = useStencilStore((s) => s.items)
  return useMemo(() => {
    const mine = records.map((r) => ({ id: r.id, name: r.stencil.name, category: r.stencil.category, tags: r.stencil.tags, stencil: r.stencil, thumbnail: r.thumbnail, builtin: false }))
    return { mine, all: new Map([...mine, ...BUILTIN_ITEMS].map((i) => [i.id, i])) }
  }, [records])
}

interface MenuState {
  item: Item
  x: number
  y: number
}

/** Overflow menu for one stencil, fixed to the viewport so scrolling panels can't clip it. */
function StencilMenu({ menu, onClose }: { menu: MenuState; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)
  const open = useStencilStore((s) => s.openDialog)
  const { item } = menu

  useLayoutEffect(() => {
    if (!ref.current) return
    const { width, height } = ref.current.getBoundingClientRect()
    const margin = 8
    setPosition({
      left: Math.max(margin, Math.min(menu.x - width, window.innerWidth - width - margin)),
      top: Math.max(margin, Math.min(menu.y, window.innerHeight - height - margin)),
    })
  }, [menu])

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && onClose()
    const onKeyDown = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown)
    ref.current?.querySelector('button')?.focus()
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])

  const run = (action: () => void) => () => {
    onClose()
    action()
  }
  const entry = (icon: ReactNode, label: string, action: () => void, danger = false) => (
    <Button role="menuitem" variant="ghost" className={cn('justify-start', danger && 'text-danger')} onClick={run(action)}>
      {icon}
      {label}
    </Button>
  )

  return createPortal(
    <Panel
      ref={ref}
      role="menu"
      aria-label={`${item.name} actions`}
      className="fixed z-50 flex min-w-52 flex-col p-1 shadow-lg"
      style={position ?? { left: menu.x, top: menu.y, visibility: 'hidden' }}
    >
      {item.builtin ? (
        entry(<Copy />, 'Duplicate to my library', () => void duplicateStencil(item.stencil, item.thumbnail))
      ) : (
        <>
          {entry(<Pencil />, 'Rename…', () => open({ kind: 'edit', id: item.id, focus: 'name' }))}
          {entry(<Tags />, 'Edit category and tags…', () => open({ kind: 'edit', id: item.id, focus: 'category' }))}
          {entry(<Copy />, 'Duplicate', () => void duplicateStencil(item.stencil, item.thumbnail))}
        </>
      )}
      {entry(<FileDown />, 'Export as JSON', () => exportStencil(item.stencil))}
      {!item.builtin && entry(<Trash2 />, 'Delete', () => void deleteStencil(item.id), true)}
      {item.builtin && <p className="px-3 pt-1 pb-2 text-xs text-text-muted">Built-in stencils are read-only. Duplicate one to edit it.</p>}
    </Panel>,
    document.body,
  )
}

function StencilRow({ item, onInsert, onMenu, tabIndex }: { item: Item; onInsert: (item: Item) => void; onMenu: (menu: MenuState) => void; tabIndex?: number }) {
  return (
    <li className="flex items-center gap-1">
      <button
        type="button"
        tabIndex={tabIndex}
        title={`Insert “${item.name}”`}
        aria-label={`Insert ${item.name} (${item.category})`}
        onClick={() => onInsert(item)}
        className="flex min-h-touch min-w-0 flex-1 touch-pan-y items-center gap-3 rounded-md p-1 text-left transition-colors select-none hover:bg-surface-muted active:bg-accent-subtle"
      >
        <Thumbnail svg={item.thumbnail} className="h-(--cl-stencil-thumb-height) w-(--cl-stencil-thumb-width)" />
        <span className="flex min-w-0 flex-col">
          <span className="line-clamp-2 text-sm wrap-break-word text-text">{item.name}</span>
          <span className="truncate text-xs text-text-muted">{item.category}</span>
        </span>
      </button>
      <Button
        variant="ghost"
        size="icon"
        tabIndex={tabIndex}
        aria-label={`More actions for ${item.name}`}
        aria-haspopup="menu"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          onMenu({ item, x: rect.right, y: rect.bottom })
        }}
      >
        <EllipsisVertical />
      </Button>
    </li>
  )
}

function Heading({ children }: { children: ReactNode }) {
  return <h3 className="text-xs font-semibold tracking-wide text-text-muted uppercase">{children}</h3>
}

/**
 * The palette's Stencils section: My library and Built-in tabs, search across
 * names, categories and tags, a category filter, recently used, and each
 * stencil's actions. Tapping a stencil inserts it at the centre of the view.
 */
export function StencilBrowser({ onInserted, tabIndex }: { onInserted?: () => void; tabIndex?: number }) {
  const [tab, setTab] = useState<Tab>('builtin')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<string | null>(null)
  const [menu, setMenu] = useState<MenuState | null>(null)
  const closeMenu = useCallback(() => setMenu(null), [])
  const fileRef = useRef<HTMLInputElement>(null)
  const actions = useCanvasActions()
  const status = useStencilStore((s) => s.status)
  const problem = useStencilStore((s) => s.problem)
  const recents = useStencilStore((s) => s.recents)
  const noteUsed = useStencilStore((s) => s.noteUsed)
  const { mine, all } = useItems()

  useEffect(() => void useStencilStore.getState().ensureLoaded(), [])

  const source = tab === 'mine' ? mine : BUILTIN_ITEMS
  const categories = categoriesOf(source)
  const activeCategory = category && categories.includes(category) ? category : null
  const results = searchItems(source, query, activeCategory)
  const recentItems = recents.map((id) => all.get(id)).filter((i): i is Item => Boolean(i))
  const browsing = !query.trim() && !activeCategory

  const insert = (item: Item) => {
    if (!actions.insertStencilAtCenter(item.stencil.content)) return
    noteUsed(item.id)
    onInserted?.()
  }

  const tabButton = (value: Tab, label: string) => (
    <button
      type="button"
      role="tab"
      tabIndex={tabIndex}
      aria-selected={tab === value}
      onClick={() => {
        setTab(value)
        setCategory(null)
      }}
      className={cn(
        'min-h-touch flex-1 border-b-2 text-sm font-medium transition-colors',
        tab === value ? 'border-accent text-text' : 'border-transparent text-text-muted hover:text-text',
      )}
    >
      {label}
    </button>
  )

  return (
    <section aria-label="Stencils" className="flex flex-col gap-3">
      <div role="tablist" aria-label="Stencil source" className="flex border-b border-border">
        {tabButton('mine', 'My library')}
        {tabButton('builtin', 'Built-in')}
      </div>
      <label className="relative block">
        <span className="sr-only">Search stencils</span>
        <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-text-muted" aria-hidden="true" />
        <input
          type="search"
          value={query}
          tabIndex={tabIndex}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search stencils"
          className="h-touch w-full min-w-0 rounded-md border border-border-strong bg-surface pr-3 pl-10 text-base text-text placeholder:text-text-muted"
        />
      </label>
      <CategoryChips categories={categories} value={activeCategory} onChange={setCategory} tabIndex={tabIndex} />

      {browsing && recentItems.length > 0 && (
        <section aria-label="Recently used stencils" className="flex flex-col gap-1.5">
          <Heading>Recently used</Heading>
          <ul className="flex flex-col">
            {recentItems.slice(0, 3).map((item) => (
              <StencilRow key={item.id} item={item} onInsert={insert} onMenu={setMenu} tabIndex={tabIndex} />
            ))}
          </ul>
        </section>
      )}

      {tab === 'mine' && (
        <div className="grid grid-cols-2 gap-2">
          <Button tabIndex={tabIndex} className="px-2" onClick={() => fileRef.current?.click()}>
            <Upload />
            Import
          </Button>
          <Button tabIndex={tabIndex} className="px-2" disabled={mine.length === 0} onClick={() => void exportLibrary()}>
            <Download />
            Export all
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) void importStencilFile(file)
            }}
          />
        </div>
      )}

      {tab === 'mine' && status === 'unavailable' ? (
        <p className="text-sm text-danger">{problem}</p>
      ) : tab === 'mine' && status !== 'ready' ? (
        <p className="text-sm text-text-muted">Loading your library…</p>
      ) : tab === 'mine' && mine.length === 0 ? (
        <p className="text-sm text-text-muted">
          Nothing saved yet. Select shapes or a group and choose <span className="font-medium text-text">Save as stencil</span>, or import a stencil file.
        </p>
      ) : results.length === 0 ? (
        <p className="text-sm text-text-muted">No stencils match{query.trim() ? ` “${query.trim()}”` : ''}.</p>
      ) : (
        <section aria-label={tab === 'mine' ? 'My library' : 'Built-in stencils'} className="flex flex-col gap-1.5">
          {browsing && recentItems.length > 0 && <Heading>{tab === 'mine' ? 'My library' : 'Built-in'}</Heading>}
          <ul className="flex flex-col">
            {results.map((item) => (
              <StencilRow key={item.id} item={item} onInsert={insert} onMenu={setMenu} tabIndex={tabIndex} />
            ))}
          </ul>
        </section>
      )}
      <p className="text-xs text-text-muted">Tap a stencil to insert it in the middle of the view.</p>
      {menu && <StencilMenu menu={menu} onClose={closeMenu} />}
    </section>
  )
}
