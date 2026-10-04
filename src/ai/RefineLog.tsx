import { Ban, ChevronDown, ChevronsLeft, ChevronsRight, ChevronUp, Link2, Minus, Plus, ScrollText, Undo2, Wrench, X } from 'lucide-react'
import { useMemo, useRef, useState, type ReactNode } from 'react'
import { announce } from '@/a11y/announce'
import { useCanvasActions } from '@/canvas/useCanvasActions'
import { Button } from '@/components/ui/button'
import { PanelResizer } from '@/editor/PanelResizer'
import { clampPaletteWidth, maxPaletteWidth } from '@/editor/paletteWidth'
import { readToken } from '@/lib/cssVar'
import { updateSettings, useSettingsStore } from '@/settings/settingsStore'
import { cn } from '@/lib/utils'
import { useDiagramStore } from '@/store/diagramStore'
import { useUiStore } from '@/store/uiStore'
import { useRefineLog, type LogEntry, type StoryItem, type StoryKind } from './refineNarrative'

/*
 * The AI change log: what each Refine did to the diagram and why, newest
 * first. Non-modal, so the canvas stays usable while reading it, and it
 * follows the other panels' rules: desktop docks it beside the canvas (never
 * over it); tablet slides it over the canvas's right edge; both can be
 * resized (drag or arrow keys on its inner edge) and collapsed to a rail,
 * remembered in settings. Phone: a bottom sheet that collapses to its header.
 * Long labels wrap; nothing scrolls sideways. Choosing a line selects and
 * shows those items. The entries are view state only.
 */

const KIND_ICON: Record<StoryKind, ReactNode> = {
  added: <Plus aria-hidden="true" className="size-4 shrink-0 text-accent" />,
  connected: <Link2 aria-hidden="true" className="size-4 shrink-0 text-accent" />,
  fixed: <Wrench aria-hidden="true" className="size-4 shrink-0 text-accent" />,
  removed: <Minus aria-hidden="true" className="size-4 shrink-0 text-danger" />,
  skipped: <Ban aria-hidden="true" className="size-4 shrink-0 text-text-muted" />,
}

/** One line of a story: what changed, and the AI's reason under it. */
export function StoryLine({ item, onShow, children }: { item: StoryItem; onShow?: () => void; children?: ReactNode }) {
  const body = (
    <span className="flex min-w-0 flex-col gap-0.5 wrap-anywhere">
      <span className={cn('text-text', item.kind === 'skipped' && 'text-text-muted')}>{item.text}</span>
      {item.why && <span className="text-xs text-text-muted">Why: {item.why}</span>}
    </span>
  )
  return (
    <li className="flex items-start gap-2">
      {children}
      <span className="mt-0.5">{KIND_ICON[item.kind]}</span>
      {onShow ? (
        <button
          type="button"
          onClick={onShow}
          className="-my-1 min-h-touch min-w-0 flex-1 rounded-sm py-1 text-left text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {body}
        </button>
      ) : (
        <span className="min-w-0 flex-1 text-sm">{body}</span>
      )}
    </li>
  )
}

const timeOf = (at: number) => new Date(at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

function Entry({ entry, latest, coveredBelow }: { entry: LogEntry; latest: boolean; coveredBelow: () => number | undefined }) {
  const actions = useCanvasActions()
  const diagram = useDiagramStore((s) => s.diagram)
  const canUndo = useDiagramStore((s) => latest && s.past.length === entry.historySize)
  const present = new Set([...diagram.nodes.map((n) => n.id), ...diagram.edges.map((e) => e.id)])

  const show = (ids: string[]) => {
    const there = ids.filter((id) => present.has(id))
    if (there.length === 0) return
    useDiagramStore.getState().setSelection(there)
    actions.revealItems(there, coveredBelow())
  }

  return (
    <article className="flex min-w-0 flex-col gap-2 border-b border-border pb-4 wrap-anywhere last:border-b-0">
      <p className="text-xs text-text-muted">
        {timeOf(entry.at)}
        {entry.instruction && <> · You asked: “{entry.instruction}”</>}
      </p>
      {entry.summary && <p className="text-sm text-text">{entry.summary}</p>}
      <ul className="flex flex-col gap-2">
        {entry.items.map((item) => (
          <StoryLine key={item.key} item={item} onShow={item.ids.some((id) => present.has(id)) ? () => show(item.ids) : undefined} />
        ))}
      </ul>
      {canUndo && (
        <Button
          variant="secondary"
          className="self-start"
          onClick={() => {
            useDiagramStore.getState().undo()
            useUiStore.getState().notify('Undid the last refinement.')
            announce('Undid the last refinement.')
          }}
        >
          <Undo2 />
          Undo this refinement
        </Button>
      )}
    </article>
  )
}

function LogBody({ coveredBelow }: { coveredBelow: () => number | undefined }) {
  const entries = useRefineLog((s) => s.entries)
  if (entries.length === 0)
    return <p className="py-4 text-sm text-text-muted">Nothing yet. When you apply a refinement, what changed and why shows here.</p>
  return (
    <div className="flex min-w-0 flex-col gap-4 py-4">
      {entries.map((entry, i) => (
        <Entry key={entry.id} entry={entry} latest={i === 0} coveredBelow={coveredBelow} />
      ))}
      <p className="text-xs text-text-muted">The log lasts until you reload. It isn’t saved with the diagram.</p>
    </div>
  )
}

const setCollapsed = (logCollapsed: boolean) => updateSettings({ panels: { logCollapsed } })

/** Title, Collapse and Close. `collapse` is the collapse button's icon (it points the way the panel goes). */
function Header({ collapse }: { collapse: ReactNode }) {
  const hide = useRefineLog((s) => s.hide)
  return (
    <div className="flex min-h-touch items-center gap-1 border-b border-border">
      <ScrollText aria-hidden="true" className="size-4 shrink-0 text-text-muted" />
      <h2 className="min-w-0 flex-1 truncate pl-1 text-sm font-semibold">AI change log</h2>
      <Button variant="ghost" size="icon" aria-label="Collapse the AI change log" title="Collapse" aria-expanded={true} onClick={() => setCollapsed(true)}>
        {collapse}
      </Button>
      <Button variant="ghost" size="icon" aria-label="Close the AI change log" title="Close" onClick={hide}>
        <X />
      </Button>
    </div>
  )
}

/** Width limits from the tokens; never more than the palette's share of the window. */
function useLogWidth() {
  const saved = useSettingsStore((s) => s.settings.panels.logWidth)
  const limits = useMemo(() => {
    const min = readToken('--cl-log-min-width', 240)
    return { min, max: maxPaletteWidth(min, readToken('--cl-log-max-width', 560), window.innerWidth), initial: readToken('--cl-log-width', 320) }
  }, [])
  // Live width while dragging; saved on release.
  const [live, setLive] = useState<number | null>(null)
  const width = live ?? clampPaletteWidth(saved ?? limits.initial, limits.min, limits.max)
  const save = (patch: { logWidth?: number | null; logCollapsed?: boolean }) => {
    setLive(null)
    updateSettings({ panels: patch })
  }
  return { width, limits, setLive, save }
}

/**
 * Tablet and desktop. `docked` (desktop): a column beside the canvas, so it
 * never covers the canvas, minimap or controls. Otherwise (tablet): over the
 * canvas's right edge, like the properties slide-over.
 */
export function RefineLogPanel({ docked = false }: { docked?: boolean }) {
  const open = useRefineLog((s) => s.open)
  const count = useRefineLog((s) => s.entries.length)
  const collapsed = useSettingsStore((s) => s.settings.panels.logCollapsed)
  const { width, limits, setLive, save } = useLogWidth()
  if (!open) return null

  const place = docked ? 'relative shrink-0 border-l border-border bg-surface' : 'absolute inset-y-0 right-0 z-30 border-l border-border bg-surface shadow-lg'
  if (collapsed) {
    return (
      <aside aria-label="AI change log" className={cn(place, 'flex w-rail flex-col items-center gap-2 overflow-y-auto py-2')}>
        <Button variant="ghost" size="icon" aria-label="Expand the AI change log" title="Expand the AI change log" aria-expanded={false} onClick={() => setCollapsed(false)}>
          <ChevronsLeft />
        </Button>
        <div aria-hidden="true" className="h-px w-6 shrink-0 bg-border" />
        <Button variant="ghost" size="icon" aria-label={`AI change log, ${count} ${count === 1 ? 'entry' : 'entries'}`} title="AI change log" onClick={() => setCollapsed(false)}>
          <ScrollText />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Close the AI change log" title="Close" onClick={useRefineLog.getState().hide}>
          <X />
        </Button>
      </aside>
    )
  }
  return (
    <aside aria-label="AI change log" className={cn(place, 'flex max-w-full')} style={{ width }}>
      <div className="flex min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto overscroll-contain px-4">
        <div className="sticky top-0 z-10 -mx-4 bg-surface px-4">
          <Header collapse={<ChevronsRight />} />
        </div>
        <LogBody coveredBelow={() => undefined} />
      </div>
      <PanelResizer
        edge="left"
        label="Resize the AI change log"
        width={width}
        min={limits.min}
        max={limits.max}
        onResize={setLive}
        onCommit={(w) => save({ logWidth: w })}
        onCollapse={() => save({ logCollapsed: true })}
        onReset={() => save({ logWidth: null })}
      />
    </aside>
  )
}

/**
 * Phone: a bottom sheet in place of the toolbar. Collapsed, it's a slim bar
 * above the toolbar (or the properties sheet), so the canvas and the tools
 * get the room back.
 */
export function RefineLogSheet() {
  const ref = useRef<HTMLElement>(null)
  const collapsed = useSettingsStore((s) => s.settings.panels.logCollapsed)
  if (collapsed) {
    return (
      <div className="w-full px-(--cl-gutter)">
        <section aria-label="AI change log" className="pointer-events-auto flex min-h-touch w-full items-center gap-1 rounded-lg border border-border bg-surface pl-3 shadow-md">
          <ScrollText aria-hidden="true" className="size-4 shrink-0 text-text-muted" />
          <h2 className="min-w-0 flex-1 truncate pl-1 text-sm font-semibold">AI change log</h2>
          <Button variant="ghost" size="icon" aria-label="Expand the AI change log" title="Expand" aria-expanded={false} onClick={() => setCollapsed(false)}>
            <ChevronUp />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Close the AI change log" title="Close" onClick={useRefineLog.getState().hide}>
            <X />
          </Button>
        </section>
      </div>
    )
  }
  return (
    <section
      ref={ref}
      aria-label="AI change log"
      className="cl-safe-bottom pointer-events-auto max-h-(--cl-sheet-max-height) w-full overflow-x-hidden overflow-y-auto overscroll-contain rounded-t-lg border-t border-border bg-surface px-4 shadow-lg"
    >
      <div className="sticky top-0 z-10 -mx-4 bg-surface px-4">
        <div className="flex justify-center pt-2" aria-hidden="true">
          <div className="h-1 w-10 rounded-full bg-border-strong" />
        </div>
        <Header collapse={<ChevronDown />} />
      </div>
      <LogBody coveredBelow={() => ref.current?.getBoundingClientRect().top} />
    </section>
  )
}

/** Opens the log; for menus and the Refine sheet. */
export function ShowLogButton({ className, onOpen }: { className?: string; onOpen?: () => void }) {
  const count = useRefineLog((s) => s.entries.length)
  if (count === 0) return null
  return (
    <Button
      variant="ghost"
      className={className}
      onClick={() => {
        onOpen?.()
        setCollapsed(false)
        useRefineLog.getState().show()
      }}
    >
      <ScrollText />
      Show the AI change log
    </Button>
  )
}
