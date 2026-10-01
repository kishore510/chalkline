import { failure, sendMessage, type Failure, type Outcome, type SendOptions } from './client'
import { aiError } from './messages'
import { validateNotes, type NoteCard } from './noteSuggestions'
import type { NotesInput } from './notesPrompt'
import type { Usage } from './usage'

/*
 * Suggest notes, end to end: send the prepared request to the small model,
 * check the answer, and return one card per suggestion. Nothing here touches
 * the diagram: accepting a card is a separate, explicit step. Loaded on
 * demand with the client.
 */

export const NOTES_TIMEOUT_MS = 60_000

export interface NotesResult {
  cards: NoteCard[]
  /** Refs sent that came back with no suggestion (the model wasn't sure). */
  skipped: string[]
  warnings: string[]
  usage: Usage | null
}

/** An answer that arrived but couldn't be used: billed, so its usage goes with it. */
const unreadable = (detail: string, usage: Usage | null): Failure => ({ ...failure('malformed', detail, { usage }), error: aiError('ai-notes-malformed', detail) })

/** Turns a checked answer into cards, in the order the shapes were sent. */
export function cardsFrom(input: NotesInput, answer: string): { ok: true; value: Omit<NotesResult, 'usage'> } | { ok: false; detail: string } {
  const checked = validateNotes(answer, new Set(input.refs.keys()))
  if (!checked.ok) return checked
  const byRef = new Map(checked.suggestions.map((s) => [s.ref, s]))
  const cards: NoteCard[] = []
  const skipped: string[] = []
  for (const target of input.targets) {
    const s = byRef.get(target.ref)
    if (s) cards.push({ ...target, suggestion: s.note, reason: s.reason })
    else skipped.push(target.ref)
  }
  return { ok: true, value: { cards, skipped, warnings: checked.warnings } }
}

export async function suggestNotes(key: string, input: NotesInput, options: SendOptions = {}): Promise<Outcome<NotesResult>> {
  const { request } = input
  // No effort setting: Claude Haiku 4.5 doesn't take one.
  const outcome = await sendMessage(
    key,
    { model: request.model, system: request.system, prompt: request.prompt, maxTokens: request.maxTokens, outputSchema: request.schema },
    { timeoutMs: NOTES_TIMEOUT_MS, ...options },
  )
  if (!outcome.ok) return outcome
  const { text, stopReason, usage } = outcome.value
  if (stopReason === 'refusal') return failure('refused', 'stop_reason: refusal', { usage })
  if (stopReason === 'max_tokens') return unreadable('stop_reason: max_tokens (the answer was cut off)', usage)
  const made = cardsFrom(input, text)
  if (!made.ok) return unreadable(made.detail, usage)
  return { ok: true, value: { ...made.value, usage }, requestId: outcome.requestId }
}
