import { Ban, Link2, Minus, Plus, ScrollText, Undo2, Wrench, X } from 'lucide-react'
import { useRef, type ReactNode } from 'react'
import { announce } from '@/a11y/announce'
import { useCanvasActions } from '@/canvas/useCanvasActions'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useDiagramStore } from '@/store/diagramStore'
import { useUiStore } from '@/store/uiStore'
import { useRefineLog, type LogEntry, type StoryItem, type StoryKind } from './refineNarrative'

/*
 * The AI change log: what each Refine did to the diagram and why, newest
 * first. A non-modal panel over the canvas's right edge (tablet and desktop)
 * or a bottom sheet (phone), so the canvas stays usable while reading it.
 * Choosing a line selects and shows those items. View state only.
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
    <span className="flex min-w-0 flex-col gap-0.5">
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
    <article className="flex flex-col gap-2 border-b border-border pb-4 last:border-b-0">
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
    <div className="flex flex-col gap-4 py-4">
      {entries.map((entry, i) => (
        <Entry key={entry.id} entry={entry} latest={i === 0} coveredBelow={coveredBelow} />
      ))}
      <p className="text-xs text-text-muted">The log lasts until you reload. It isn’t saved with the diagram.</p>
    </div>
  )
}

function Header() {
  const hide = useRefineLog((s) => s.hide)
  return (
    <div className="flex min-h-touch items-center gap-2 border-b border-border">
      <ScrollText aria-hidden="true" className="size-4 shrink-0 text-text-muted" />
      <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">AI change log</h2>
      <Button variant="ghost" size="icon" aria-label="Close the AI change log" title="Close" onClick={hide}>
        <X />
      </Button>
    </div>
  )
}

/** Tablet and desktop: slides over the canvas's right edge. */
export function RefineLogPanel() {
  const open = useRefineLog((s) => s.open)
  return (
    <aside
      aria-label="AI change log"
      aria-hidden={!open}
      inert={!open}
      className={cn(
        'absolute inset-y-0 right-0 z-30 flex w-properties flex-col overflow-y-auto overscroll-contain border-l border-border bg-surface px-4 shadow-lg',
        'transition-transform duration-(--cl-duration-base) ease-standard',
        open ? 'translate-x-0' : 'translate-x-full',
      )}
    >
      {open && (
        <>
          <Header />
          <LogBody coveredBelow={() => undefined} />
        </>
      )}
    </aside>
  )
}

/** Phone: a bottom sheet in place of the toolbar. */
export function RefineLogSheet() {
  const ref = useRef<HTMLElement>(null)
  return (
    <section
      ref={ref}
      aria-label="AI change log"
      className="cl-safe-bottom pointer-events-auto max-h-(--cl-sheet-max-height) w-full overflow-y-auto overscroll-contain rounded-t-lg border-t border-border bg-surface px-4 shadow-lg"
    >
      <div className="sticky top-0 z-10 -mx-4 bg-surface px-4">
        <div className="flex justify-center pt-2" aria-hidden="true">
          <div className="h-1 w-10 rounded-full bg-border-strong" />
        </div>
        <Header />
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
        useRefineLog.getState().show()
      }}
    >
      <ScrollText />
      Show the AI change log
    </Button>
  )
}
