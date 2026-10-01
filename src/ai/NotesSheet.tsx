import { Check, Eye, Loader2, NotebookPen, RotateCcw, Settings as SettingsIcon, TriangleAlert, X } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { announce } from '@/a11y/announce'
import { useCanvasActions } from '@/canvas/useCanvasActions'
import { Button } from '@/components/ui/button'
import { ToggleField } from '@/editor/fields'
import { spokenError, type FriendlyError } from '@/errors/friendly'
import { InlineProblem } from '@/errors/InlineProblem'
import { LearnMore } from '@/help/HelpEntry'
import { LEARN_MORE } from '@/help/links'
import { cn } from '@/lib/utils'
import type { Diagram } from '@/schema/diagram'
import { openSettings } from '@/settings/SettingsEntry'
import { updateSettings, useSettingsStore } from '@/settings/settingsStore'
import { getShape } from '@/shapes/registry'
import { useDiagramStore } from '@/store/diagramStore'
import { AiSheetFrame, ModeSwitch, UsageLine, usePageFocus, WRAP } from './AiSheetFrame'
import { ConfirmSend } from './ConfirmSend'
import { useAiSheet } from './GenerateEntry'
import { getApiKey, useKeyStatus } from './keyStore'
import { aiError } from './messages'
import { acceptCheck, cardState, type NoteCard } from './noteSuggestions'
import { MAX_NOTE_SHAPES, NEIGHBOUR_CAP, NOTE_LIMIT, notesInput, notesModel, notesPlan, notesSelection, selectionHint, type NotesInput } from './notesPrompt'
import { acceptNotes, acceptPlan, isAccepted, useNotesStore, visibleCards, type CardUi } from './notesStore'
import { shapeTargets } from './reviewStore'
import { useUsageStore } from './usage'

/*
 * Suggest notes: for 1 to 5 selected shapes, ask the small model for one
 * short note each, then review them card by card. Nothing is written until a
 * card is accepted, and accepting only ever adds to a shape's notes field
 * (one undo step per Accept or Accept all). "Show shape" only changes the
 * selection and the view. Suggestions are view state in their own store:
 * not saved, not an undo step, not in any export.
 */

type Page = 'compose' | 'confirm' | 'sending' | 'result'

const TITLES: Record<Page, string> = {
  compose: 'Suggest notes',
  confirm: 'Check before sending',
  sending: 'Suggesting notes…',
  result: 'Suggested notes',
}

export const NOTES_ACCURACY = 'AI suggestions can be wrong. Check each one before accepting.'

const count = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`
const nameOf = (label: string) => (label.trim() ? `“${label.trim()}”` : 'Untitled shape')
const chars = (text: string) => [...text.trim()].length

function NoteCardView({
  card,
  ui,
  diagram,
  onEdit,
  onAccept,
  onDismiss,
  onConfirmStale,
  onShow,
}: {
  card: NoteCard
  ui: CardUi
  diagram: Diagram
  onEdit: (text: string) => void
  onAccept: () => void
  onDismiss: () => void
  onConfirmStale: () => void
  onShow: () => void
}) {
  const id = useId()
  const state = cardState(diagram, card)
  const accepted = isAccepted(diagram, card, ui)
  const check = acceptCheck(diagram, card, ui.text, ui.staleConfirmed)
  const label = state.kind === 'ready' ? state.current.label : card.label
  const length = chars(ui.text)
  const over = length > NOTE_LIMIT
  const append = state.kind === 'ready' && state.append
  const stale = state.kind === 'ready' && state.stale && !accepted
  const current = state.kind === 'ready' ? state.current.notes : card.notes

  return (
    <li data-card={card.ref}>
      <article aria-labelledby={`${id}-t`} className={cn('flex flex-col gap-2 rounded-md border p-3 break-words', accepted ? 'border-accent' : 'border-border')}>
        <div className="flex flex-col gap-0.5">
          <h4 id={`${id}-t`} className="font-semibold">
            {nameOf(label)}
          </h4>
          <p className="text-xs text-text-muted">{getShape(card.type).name}</p>
        </div>
        {accepted ? (
          <>
            <p role="note" className="flex gap-2 text-sm">
              <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-accent" />
              Accepted. It’s now an ordinary note; Undo puts the old one back.
            </p>
            <p className="rounded-md bg-surface-muted p-2 whitespace-pre-wrap">{ui.written}</p>
          </>
        ) : (
          <>
            {current.trim() && (
              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium text-text-muted">Current note</p>
                <p className="rounded-md bg-surface-muted p-2 whitespace-pre-wrap">{current}</p>
              </div>
            )}
            {stale && (
              <div role="group" aria-label="Changed since this suggestion" className="flex flex-col gap-2 rounded-md border border-border-strong p-2 text-xs">
                <p className="flex gap-2">
                  <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-text-muted" />
                  Changed since this suggestion: its {card.label !== label ? (card.notes !== current ? 'label and note' : 'label') : 'note'} {card.label !== label && card.notes !== current ? 'were' : 'was'} edited after you sent it.
                </p>
                <label className="flex min-h-touch cursor-pointer items-center gap-3 text-sm has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent">
                  <input type="checkbox" checked={ui.staleConfirmed} onChange={onConfirmStale} className="size-4 shrink-0 accent-accent" />
                  I’ve checked: accept it anyway
                </label>
              </div>
            )}
            <label htmlFor={`${id}-n`} className="text-sm font-medium">
              {append ? 'Text to add after the current note' : 'Suggested note'}
            </label>
            <textarea
              id={`${id}-n`}
              value={ui.text}
              rows={3}
              disabled={state.kind !== 'ready'}
              aria-describedby={`${id}-c`}
              aria-invalid={over || undefined}
              onChange={(e) => onEdit(e.target.value)}
              className="min-h-touch w-full min-w-0 resize-none rounded-md border border-border-strong bg-surface px-3 py-2.5 text-base text-text transition-colors focus-visible:border-focus disabled:opacity-60 pointer-fine:resize-y"
            />
            <p id={`${id}-c`} className={cn('text-xs tabular-nums', over ? 'font-medium text-danger' : 'text-text-muted')}>
              {length} of {NOTE_LIMIT} characters{over ? `: ${length - NOTE_LIMIT} over. Shorten it to accept.` : '.'}
            </p>
            {card.reason && (
              <p className="text-xs text-text-muted">
                <span className="font-medium">Why:</span> {card.reason}
              </p>
            )}
            {state.kind === 'disabled' && (
              <p role="note" className="text-xs text-text">
                {state.reason}
              </p>
            )}
          </>
        )}
        <div className="flex flex-wrap gap-2">
          {!accepted && (
            <Button variant="primary" className={WRAP} disabled={!check.ok} onClick={onAccept} aria-describedby={`${id}-t`}>
              <Check />
              {append ? 'Append to existing note' : 'Accept'}
            </Button>
          )}
          {state.kind === 'ready' && (
            <Button variant="secondary" className={WRAP} onClick={onShow} aria-describedby={`${id}-t`}>
              <Eye />
              Show shape
            </Button>
          )}
          {!accepted && (
            <Button variant="ghost" className={WRAP} onClick={onDismiss} aria-describedby={`${id}-t`}>
              <X />
              Dismiss
            </Button>
          )}
        </div>
      </article>
    </li>
  )
}

export function NotesPanel({ active }: { active: boolean }) {
  const close = useAiSheet((s) => s.closeGenerate)
  const hasKey = useKeyStatus((s) => s.place !== null)
  const needsNotice = useSettingsStore((s) => !s.settings.ai.noticeAcknowledged)
  const diagram = useDiagramStore((s) => s.diagram)
  const selectionIds = useDiagramStore((s) => s.selection)
  const run = useNotesStore((s) => s.run)
  const ui = useNotesStore((s) => s.ui)
  const actions = useCanvasActions()

  const [page, setPage] = useState<Page>(() => (useNotesStore.getState().run ? 'result' : 'compose'))
  const [includeNotes, setIncludeNotes] = useState(false)
  const [captured, setCaptured] = useState<NotesInput | null>(null)
  const [problem, setProblem] = useState<FriendlyError | null>(null)
  const [held, setHeld] = useState<string[]>([])
  const controller = useRef<AbortController | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const listId = useId()

  const selection = useMemo(() => notesSelection(diagram, selectionIds), [diagram, selectionIds])
  const hint = selectionHint(selection)
  const withNotes = selection.kind === 'ok' ? selection.shapes.filter((n) => n.notes.trim()).length : 0

  const shut = () => {
    controller.current?.abort()
    close()
  }
  useEffect(() => () => controller.current?.abort(), [])

  const back = page === 'confirm' ? () => setPage(run ? 'result' : 'compose') : page === 'result' ? () => setPage('compose') : undefined
  usePageFocus(page, bodyRef, titleRef)

  /** Opens the check step with a snapshot of what will be sent. */
  function check() {
    const { diagram: now, selection: ids } = useDiagramStore.getState()
    const chosen = notesSelection(now, ids)
    if (chosen.kind !== 'ok') {
      announce(selectionHint(chosen))
      return
    }
    setCaptured(notesInput(now, chosen.shapes, includeNotes))
    setProblem(null)
    setPage('confirm')
  }

  async function send(input: NotesInput) {
    const key = getApiKey()
    if (!key) {
      setProblem(aiError('ai-no-key'))
      setPage('compose')
      return
    }
    const abort = new AbortController()
    controller.current = abort
    setProblem(null)
    setPage('sending')
    const model = input.request.model
    announce(`Asking ${model.name} for notes…`)
    try {
      const { suggestNotes } = await import('./suggestNotes')
      const outcome = await suggestNotes(key, input, { signal: abort.signal })
      useUsageStore.getState().record(model, outcome.ok ? outcome.value.usage : outcome.usage)
      if (!useAiSheet.getState().open) return
      if (!outcome.ok && outcome.reason === 'cancelled') {
        setPage(useNotesStore.getState().run ? 'result' : 'compose')
        announce('Cancelled. Nothing was changed.')
        return
      }
      if (!outcome.ok) {
        setProblem(outcome.error)
        setPage('compose')
        announce(spokenError(outcome.error))
        return
      }
      const { cards, skipped, warnings } = outcome.value
      const label = (ref: string) => nameOf(input.targets.find((t) => t.ref === ref)?.label ?? '')
      useNotesStore.getState().setRun({ model, cards, skipped: skipped.map(label), warnings })
      setHeld([])
      setPage('result')
      announce(`${count(cards.length, 'note')} suggested${skipped.length ? `, ${count(skipped.length, 'shape')} without one` : ''}. ${NOTES_ACCURACY}`)
    } catch {
      const error = aiError('ai-unexpected', 'Suggesting notes failed before an answer could be read.')
      setProblem(error)
      setPage('compose')
      announce(spokenError(error))
    } finally {
      if (controller.current === abort) controller.current = null
    }
  }

  /** After a card closes, focus the next open card (or the list's heading). */
  function focusAfter(ref: string) {
    requestAnimationFrame(() => {
      const items = [...(bodyRef.current?.querySelectorAll<HTMLElement>('[data-card]') ?? [])]
      const at = items.findIndex((el) => el.dataset.card === ref)
      const next = [...items.slice(at + 1), ...items.slice(0, Math.max(0, at))].find((el) => el.querySelector('textarea:not([disabled])'))
      ;(next?.querySelector<HTMLElement>('textarea') ?? document.getElementById(listId))?.focus()
    })
  }

  function accept(only?: string) {
    const plan = acceptNotes(only)
    const labelOf = (ref: string) => useNotesStore.getState().run?.cards.find((c) => c.ref === ref)?.label ?? ''
    const reasons = plan.held.map((h) => `${nameOf(labelOf(h.ref))}: ${h.reason}`)
    setHeld(only === undefined ? reasons : [])
    if (plan.changes.length === 0) {
      announce(reasons[0] ?? 'Nothing to accept.')
      return
    }
    announce(`Accepted ${count(plan.changes.length, 'note')}${plan.held.length ? `; ${count(plan.held.length, 'card')} held back` : ''}. Undo puts the old notes back.`)
    if (only) focusAfter(only)
  }

  /** Selects and centres a card's shape. Never changes the diagram's content. */
  function show(card: NoteCard) {
    const targets = shapeTargets(useDiagramStore.getState().diagram, [card.id])
    if (targets.select.length === 0) {
      announce(targets.missing ? 'That shape is no longer in the diagram.' : 'That shape is on a hidden layer.')
      return
    }
    useDiagramStore.getState().setSelection(targets.select)
    close()
    requestAnimationFrame(() => actions.revealItems(targets.select))
    announce(`${targets.collapsed ? 'Its collapsed group is' : 'Shape'} selected and centred. Open AI to go back to the suggestions.`)
  }

  let body: ReactNode
  if (page === 'compose' || (!hasKey && page !== 'result')) {
    body = (
      <div className="flex flex-col gap-4 pt-4 text-sm text-text">
        <ModeSwitch />
        <p>Suggests a short note for each selected shape, up to {MAX_NOTE_SHAPES}. You check each one: only the ones you accept are written, and an existing note is only ever added to.</p>
        {!hasKey ? (
          <>
            <p>Suggest notes uses your own Anthropic API key, and you pay Anthropic for what it uses. Nothing is sent until you check and press Send.</p>
            <Button
              variant="primary"
              className={WRAP}
              onClick={() => {
                close()
                openSettings('ai')
              }}
            >
              <SettingsIcon />
              Open Settings, AI
            </Button>
          </>
        ) : (
          <>
            {selection.kind === 'ok' ? (
              <div className="flex flex-col gap-1">
                <p className="font-medium">{count(selection.shapes.length, 'selected shape')}</p>
                <p className="text-xs text-text-muted">{selection.shapes.map((n) => nameOf(n.label)).join(', ')}</p>
              </div>
            ) : (
              <p role="note" className="rounded-md border border-border-strong p-3">
                {hint}
              </p>
            )}
            <div className="flex flex-col gap-1">
              <ToggleField label="Use existing notes as context" pressed={includeNotes} onChange={setIncludeNotes} />
              <p className="text-xs text-text-muted">
                {withNotes === 0
                  ? 'None of the selected shapes has a note.'
                  : includeNotes
                    ? `${count(withNotes, 'note')} will be sent.`
                    : `${count(withNotes, 'note')} left out: the AI is only told that ${withNotes === 1 ? 'the shape has' : 'those shapes have'} one.`}
              </p>
            </div>
            <p className="text-xs text-text-muted">
              Model: <span className="font-medium text-text">{notesModel.name}</span>. The selected shapes’ labels and types, and the shapes they connect to (up to {NEIGHBOUR_CAP} connections each), are sent to Anthropic’s API when you press Send.
            </p>
            {problem && (
              <InlineProblem error={problem}>
                {problem.kind !== 'ai-no-key' && (
                  <Button variant="secondary" onClick={check} disabled={selection.kind !== 'ok'}>
                    <RotateCcw />
                    Retry
                  </Button>
                )}
              </InlineProblem>
            )}
            <Button variant="primary" className={WRAP} disabled={selection.kind !== 'ok'} onClick={check} data-autofocus="">
              <NotebookPen />
              Suggest notes
            </Button>
          </>
        )}
        {run && (
          <Button variant="ghost" className={WRAP} onClick={() => setPage('result')}>
            Back to the last suggestions
          </Button>
        )}
        <UsageLine />
        <LearnMore topic={LEARN_MORE.notes} className="self-start px-0" />
      </div>
    )
  } else if (page === 'confirm' && captured) {
    body = (
      <div className="pt-4">
        <ConfirmSend
          plan={notesPlan(captured)}
          needsNotice={needsNotice}
          details={[
            { term: 'Scope', value: `${count(captured.targets.length, 'selected shape')}: ${captured.targets.map((t) => nameOf(t.label)).join(', ')}` },
            { term: 'Result', value: 'Suggestions to check one by one. Nothing is written to your diagram until you accept it.' },
          ]}
          onCancel={() => setPage(run ? 'result' : 'compose')}
          onSend={() => {
            if (needsNotice) updateSettings({ ai: { noticeAcknowledged: true } })
            void send(captured)
          }}
        />
      </div>
    )
  } else if (page === 'sending') {
    body = (
      <div className="flex flex-col gap-4 pt-4 text-sm text-text">
        <p className="flex min-h-touch items-center gap-2" role="status">
          <Loader2 aria-hidden="true" className="size-5 shrink-0 motion-safe:animate-spin" />
          Asking {notesModel.name} for notes. This usually takes a few seconds.
        </p>
        <Button variant="secondary" className={WRAP} onClick={() => controller.current?.abort()} data-autofocus="">
          <X />
          Cancel
        </Button>
      </div>
    )
  } else {
    const cards = visibleCards(diagram, run, ui)
    const open = acceptPlan(diagram, run, ui)
    const dismissed = (run?.cards ?? []).filter((c) => ui[c.ref]?.dismissed).length
    body = (
      <div className="flex flex-col gap-4 pt-4 text-sm text-text">
        <h3 id={listId} tabIndex={-1} data-autofocus="" className="font-semibold outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
          {count(cards.length, 'suggestion')}
        </h3>
        <p className="text-xs text-text-muted">
          {run?.model.name}. {NOTES_ACCURACY} Suggestions aren’t saved until you accept them.
        </p>
        {run && run.warnings.length > 0 && (
          <ul className="flex list-disc flex-col gap-1 pl-5 text-xs text-text-muted">
            {run.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        )}
        {run && run.skipped.length > 0 && (
          <p className="text-xs text-text-muted">
            No suggestion for {run.skipped.join(', ')}: the AI couldn’t tell {run.skipped.length === 1 ? 'its role' : 'their roles'} from the diagram.
          </p>
        )}
        {cards.length === 0 ? (
          <p className="text-text-muted">{run && run.cards.length > 0 ? 'No suggestions left to check.' : 'No notes were suggested.'}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {cards.map((card) => (
              <NoteCardView
                key={card.ref}
                card={card}
                ui={ui[card.ref]!}
                diagram={diagram}
                onEdit={(text) => useNotesStore.getState().edit(card.ref, text)}
                onAccept={() => accept(card.ref)}
                onDismiss={() => {
                  useNotesStore.getState().dismiss(card.ref)
                  announce(`Dismissed the note for ${nameOf(card.label)}.`)
                  focusAfter(card.ref)
                }}
                onConfirmStale={() => useNotesStore.getState().confirmStale(card.ref)}
                onShow={() => show(card)}
              />
            ))}
          </ul>
        )}
        {held.length > 0 && (
          <ul role="note" className="flex list-disc flex-col gap-1 rounded-md border border-border-strong py-2 pr-2 pl-7 text-xs">
            {held.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
        )}
        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <Button variant="primary" className={WRAP} disabled={open.changes.length === 0} onClick={() => accept()}>
            <Check />
            {open.changes.length > 1 ? `Accept all (${open.changes.length})` : 'Accept all'}
          </Button>
          {dismissed > 0 && (
            <Button variant="ghost" className={WRAP} onClick={() => useNotesStore.getState().undismissAll()}>
              Show {count(dismissed, 'dismissed suggestion')}
            </Button>
          )}
          <Button variant="secondary" className={WRAP} onClick={() => setPage('compose')}>
            <RotateCcw />
            Suggest again
          </Button>
          <Button variant="ghost" className={WRAP} onClick={shut}>
            Close
          </Button>
        </div>
        <UsageLine />
      </div>
    )
  }

  if (!active) return null
  return (
    <AiSheetFrame
      title={!hasKey && page !== 'result' ? TITLES.compose : TITLES[page]}
      icon={<NotebookPen />}
      back={back}
      busy={page === 'sending'}
      onEscape={() => (page === 'sending' ? controller.current?.abort() : page !== 'result' && back ? back() : shut())}
      onClose={shut}
      bodyRef={bodyRef}
      titleRef={titleRef}
    >
      {body}
    </AiSheetFrame>
  )
}
