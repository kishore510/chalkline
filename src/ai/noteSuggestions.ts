import type { Diagram } from '@/schema/diagram'
import { isNodeHidden } from '@/store/layers'
import { plainText, stripFences } from './generated'
import { NOTE_LIMIT, REASON_LIMIT, type NotesTarget } from './notesPrompt'
import { trimTo } from './reviewFindings'

/*
 * Suggested notes: the answer contract, checked after it arrives, and the
 * rules for accepting a card. The answer is never trusted: only refs that
 * were sent, one suggestion per shape, plain text, within the caps. Fields
 * other than ref, note and reason are dropped and counted. Accepting only
 * ever writes a shape's notes field, and only adds to an existing note.
 */

export interface NoteSuggestion {
  ref: string
  note: string
  reason: string
}

export type NotesValidation = { ok: true; suggestions: NoteSuggestion[]; warnings: string[] } | { ok: false; detail: string }

const MARKUP = [
  // HTML tags and comments, including autolinks like <https://…>.
  [/<!--[\s\S]*?-->/g, ' '],
  [/<\/?[a-z!][^>]*>/gi, ' '],
  // Images and links: keep the words, drop the address.
  [/!\[([^\]]*)\]\([^)]*\)/g, '$1'],
  [/\[([^\]]+)\]\([^)]*\)/g, '$1'],
  // Bare addresses.
  [/\b(?:https?:\/\/|www\.)\S+/gi, ''],
  // Headings, quotes and list markers at the start of a line.
  [/^\s{0,3}(?:#{1,6}\s+|>\s?|[-*+]\s+|\d+[.)]\s+)/gm, ''],
  // Emphasis and code.
  [/(\*\*|__)(.+?)\1/g, '$2'],
  [/(^|[\s(])[*_](\S(?:.*?\S)?)[*_](?=[\s).,;:!?]|$)/g, '$1$2'],
  [/~~(.+?)~~/g, '$1'],
  [/`+([^`]*)`+/g, '$1'],
] as const

/** Plain text: Markdown, HTML and links removed, on one line. */
export function plainNote(value: string | null | undefined): string {
  let out = value ?? ''
  for (const [pattern, replacement] of MARKUP) out = out.replace(pattern, replacement)
  return plainText(out.replace(/[<>]/g, ' '))
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const was = (n: number) => (n === 1 ? 'was' : 'were')

const ALLOWED = new Set(['ref', 'note', 'reason'])

/**
 * Checks the answer against the refs that were sent. Fixable problems are
 * fixed and listed; an answer that isn't `{ suggestions: [...] }` at all is
 * malformed.
 */
export function validateNotes(answer: string, sentRefs: ReadonlySet<string>): NotesValidation {
  let json: unknown
  try {
    json = JSON.parse(stripFences(answer))
  } catch {
    return { ok: false, detail: 'The answer wasn’t JSON.' }
  }
  if (!json || typeof json !== 'object' || Array.isArray(json)) return { ok: false, detail: 'The answer wasn’t a JSON object.' }
  const raw = json as Record<string, unknown>
  if (!Array.isArray(raw.suggestions)) return { ok: false, detail: 'The answer had no list of suggestions.' }

  let extra = Object.keys(raw).filter((k) => k !== 'suggestions').length
  let unknown = 0
  let duplicate = 0
  let empty = 0
  let unreadable = 0
  let trimmed = 0
  let formatting = 0
  const seen = new Set<string>()
  const suggestions: NoteSuggestion[] = []

  for (const item of raw.suggestions) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      unreadable++
      continue
    }
    const fields = item as Record<string, unknown>
    extra += Object.keys(fields).filter((k) => !ALLOWED.has(k)).length
    const ref = typeof fields.ref === 'string' ? fields.ref.trim() : ''
    if (typeof fields.note !== 'string') {
      unreadable++
      continue
    }
    if (!sentRefs.has(ref)) {
      unknown++
      continue
    }
    if (seen.has(ref)) {
      duplicate++
      continue
    }
    const note = plainNote(fields.note)
    if (note !== plainText(fields.note)) formatting++
    if (!note) {
      empty++
      continue
    }
    seen.add(ref)
    const reasonRaw = typeof fields.reason === 'string' ? fields.reason : ''
    const reason = plainNote(reasonRaw)
    if (reason !== plainText(reasonRaw)) formatting++
    if ([...note].length > NOTE_LIMIT || [...reason].length > REASON_LIMIT) trimmed++
    suggestions.push({ ref, note: trimTo(note, NOTE_LIMIT), reason: trimTo(reason, REASON_LIMIT) })
  }

  const warnings = [
    ...(unknown ? [`${plural(unknown, 'suggestion')} named a shape that wasn’t sent, so ${unknown === 1 ? 'it was' : 'they were'} left out.`] : []),
    ...(duplicate ? [`${plural(duplicate, 'extra suggestion')} for the same shape ${was(duplicate)} left out (the first one is kept).`] : []),
    ...(empty ? [`${plural(empty, 'empty suggestion')} ${was(empty)} left out.`] : []),
    ...(unreadable ? [`${plural(unreadable, 'suggestion')} couldn’t be read and ${was(unreadable)} left out.`] : []),
    ...(trimmed ? [`${plural(trimmed, 'suggestion')} ${was(trimmed)} too long and ${was(trimmed)} shortened.`] : []),
    ...(formatting ? [`Formatting, HTML or links were removed from ${plural(formatting, 'suggestion')}: notes are plain text.`] : []),
    ...(extra ? [`The answer tried to set ${plural(extra, 'other field')}. ${extra === 1 ? 'It was' : 'They were'} ignored: only notes can be suggested.`] : []),
  ]
  return { ok: true, suggestions, warnings }
}

/* ---------- Accepting ---------- */

/** One card in the review: the shape as it was when sent, and what's suggested. */
export interface NoteCard extends NotesTarget {
  suggestion: string
  reason: string
}

/** A card's text added to a note: after a blank line, never replacing it. */
export function appendNote(existing: string, addition: string): string {
  const add = addition.trim()
  const kept = existing.trimEnd()
  return kept ? `${kept}\n\n${add}` : add
}

export type CardState =
  | { kind: 'gone' }
  | { kind: 'disabled'; reason: string }
  | { kind: 'ready'; stale: boolean; append: boolean; current: { label: string; notes: string } }

/**
 * What can be done with a card now. Notes stay editable by hand on locked
 * shapes, in locked groups and on locked layers, so the same goes here; a
 * shape on a hidden layer can't be selected or edited, so its card waits.
 */
export function cardState(diagram: Diagram, card: NoteCard): CardState {
  const node = diagram.nodes.find((n) => n.id === card.id)
  if (!node) return { kind: 'gone' }
  if (isNodeHidden(diagram, node)) return { kind: 'disabled', reason: 'This shape is on a hidden layer. Show the layer to accept or edit its note.' }
  return {
    kind: 'ready',
    stale: node.label !== card.label || node.notes !== card.notes,
    append: node.notes.trim().length > 0,
    current: { label: node.label, notes: node.notes },
  }
}

export type AcceptCheck = { ok: true; notes: string } | { ok: false; reason: string }

/** The note a card would leave on its shape, or why it can't be accepted yet. */
export function acceptCheck(diagram: Diagram, card: NoteCard, text: string, staleConfirmed: boolean): AcceptCheck {
  const state = cardState(diagram, card)
  if (state.kind === 'gone') return { ok: false, reason: 'This shape is no longer in the diagram.' }
  if (state.kind === 'disabled') return { ok: false, reason: state.reason }
  const added = text.trim()
  if (!added) return { ok: false, reason: 'The suggested note is empty.' }
  const length = [...added].length
  if (length > NOTE_LIMIT) return { ok: false, reason: `This is ${length} characters, over the ${NOTE_LIMIT}-character limit for a suggested note. Shorten it to accept.` }
  if (state.stale && !staleConfirmed) return { ok: false, reason: 'This shape changed since the suggestion. Confirm to accept anyway.' }
  return { ok: true, notes: appendNote(state.current.notes, added) }
}
