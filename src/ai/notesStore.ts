import { create } from 'zustand'
import type { Diagram } from '@/schema/diagram'
import { useDiagramStore } from '@/store/diagramStore'
import type { AiModel } from './models'
import { acceptCheck, cardState, type NoteCard } from './noteSuggestions'
import { useRefineLog } from './refineNarrative'

/*
 * Suggested notes: view state only. Never saved, never an undo step, never
 * exported; gone on reload. They outlive the AI sheet, so "Show shape" can
 * close it and the AI button brings the cards back. Accepting a card writes
 * the note through the diagram store (one undo step); from then on it's an
 * ordinary note.
 */

export interface CardUi {
  /** The text in the card's box: the suggestion, as edited. */
  text: string
  dismissed: boolean
  /** "Accept anyway" for a shape that changed since the suggestion. */
  staleConfirmed: boolean
  /** The note this card wrote, if accepted. The card shows as accepted while the shape's note is still exactly this. */
  written?: string
}

export interface NotesRun {
  model: AiModel
  cards: NoteCard[]
  /** Shapes that came back with no suggestion, by label. */
  skipped: string[]
  warnings: string[]
}

interface NotesState {
  run: NotesRun | null
  ui: Record<string, CardUi>
  setRun: (run: NotesRun) => void
  edit: (ref: string, text: string) => void
  dismiss: (ref: string) => void
  undismissAll: () => void
  confirmStale: (ref: string) => void
  markWritten: (written: ReadonlyMap<string, string>) => void
  /** For tests. */
  reset: () => void
}

export const useNotesStore = create<NotesState>()((set) => {
  const patch = (ref: string, change: Partial<CardUi>) => set((s) => (s.ui[ref] ? { ui: { ...s.ui, [ref]: { ...s.ui[ref], ...change } } } : {}))
  return {
    run: null,
    ui: {},
    setRun: (run) => set({ run, ui: Object.fromEntries(run.cards.map((c) => [c.ref, { text: c.suggestion, dismissed: false, staleConfirmed: false }])) }),
    edit: (ref, text) => patch(ref, { text }),
    dismiss: (ref) => patch(ref, { dismissed: true }),
    undismissAll: () => set((s) => ({ ui: Object.fromEntries(Object.entries(s.ui).map(([ref, u]) => [ref, { ...u, dismissed: false }])) })),
    confirmStale: (ref) => patch(ref, { staleConfirmed: true }),
    markWritten: (written) => set((s) => ({ ui: Object.fromEntries(Object.entries(s.ui).map(([ref, u]) => [ref, written.has(ref) ? { ...u, written: written.get(ref) } : u])) })),
    reset: () => set({ run: null, ui: {} }),
  }
})

/** Accepted: this card wrote the shape's note, and it hasn't changed since (an undo puts the card back). */
export function isAccepted(diagram: Diagram, card: NoteCard, ui: CardUi | undefined): boolean {
  if (ui?.written === undefined) return false
  return diagram.nodes.find((n) => n.id === card.id)?.notes === ui.written
}

/** The cards still to show: not dismissed, and their shapes still in the diagram. */
export const visibleCards = (diagram: Diagram, run: NotesRun | null, ui: Record<string, CardUi>) =>
  (run?.cards ?? []).filter((c) => !ui[c.ref]?.dismissed && cardState(diagram, c).kind !== 'gone')

export interface AcceptPlan {
  changes: { id: string; ref: string; notes: string }[]
  /** Cards that weren't accepted, with why. */
  held: { ref: string; reason: string }[]
}

/**
 * What "Accept all" (or one Accept) would write: every open card that can be
 * accepted as it stands. Changed, over-long and hidden ones are held back
 * with their reason; accepted, dismissed and deleted ones are skipped.
 */
export function acceptPlan(diagram: Diagram, run: NotesRun | null, ui: Record<string, CardUi>, only?: string): AcceptPlan {
  const plan: AcceptPlan = { changes: [], held: [] }
  for (const card of visibleCards(diagram, run, ui)) {
    if (only !== undefined && card.ref !== only) continue
    const u = ui[card.ref]
    if (!u || isAccepted(diagram, card, u)) continue
    const check = acceptCheck(diagram, card, u.text, u.staleConfirmed)
    if (check.ok) plan.changes.push({ id: card.id, ref: card.ref, notes: check.notes })
    else plan.held.push({ ref: card.ref, reason: check.reason })
  }
  return plan
}

/**
 * Accepts one card (by ref) or all of them: ONE call to the diagram store,
 * so ONE undo step, writing only notes. Returns what was written and held.
 */
export function acceptNotes(only?: string): AcceptPlan {
  const { run, ui, markWritten } = useNotesStore.getState()
  const store = useDiagramStore.getState()
  const plan = acceptPlan(store.diagram, run, ui, only)
  if (plan.changes.length > 0) {
    const before = store.diagram
    store.acceptSuggestedNotes(plan.changes.map(({ id, notes }) => ({ id, notes })))
    markWritten(new Map(plan.changes.map((c) => [c.ref, c.notes])))
    // The AI change log: each note with the AI's reason for it. Recorded without opening the log.
    const card = new Map(run?.cards.map((c) => [c.ref, c]))
    const name = (id: string) => before.nodes.find((n) => n.id === id)?.label.trim()
    const n = plan.changes.length
    useRefineLog.getState().add(
      {
        feature: 'notes',
        at: Date.now(),
        instruction: '',
        summary: `Added ${n === 1 ? 'a suggested note' : `${n} suggested notes`}.`,
        items: plan.changes.map((c) => ({
          key: c.ref,
          kind: 'added' as const,
          text: `Added a note to ${name(c.id) ? `“${name(c.id)}”` : 'an untitled shape'}`,
          why: card.get(c.ref)?.reason ?? '',
          ids: [c.id],
        })),
        historySize: useDiagramStore.getState().past.length,
      },
      { open: false },
    )
  }
  return plan
}
