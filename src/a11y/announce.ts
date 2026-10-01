import { create } from 'zustand'
import { connectorName, shapeName } from '@/canvas/focusOrder'
import type { Diagram } from '@/schema/diagram'
import { useSearchStore } from '@/search/searchStore'
import { useDiagramStore } from '@/store/diagramStore'
import { useUiStore, type Tool } from '@/store/uiStore'

/*
 * Screen-reader announcements through one polite live region (LiveRegion).
 * View state only: never saved, never an undo step, never exported. The
 * wording is pure (tested); startAnnouncements wires it to the stores.
 */

interface AnnounceState {
  /** `id` changes on every announcement, so the same words can be said twice. */
  message: { id: number; text: string } | null
  announce: (text: string) => void
}

export const useAnnounceStore = create<AnnounceState>()((set) => ({
  message: null,
  announce: (text) => set((s) => ({ message: { id: (s.message?.id ?? 0) + 1, text } })),
}))

export const announce = (text: string) => useAnnounceStore.getState().announce(text)

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** What's selected, in words. */
export function selectionMessage(d: Diagram, selection: readonly string[]): string {
  if (selection.length === 0) return 'Selection cleared'
  const ids = new Set(selection)
  const nodes = d.nodes.filter((n) => ids.has(n.id))
  const edges = d.edges.filter((e) => ids.has(e.id))
  const groups = d.groups.filter((g) => ids.has(g.id))
  const label = (id: string) => d.nodes.find((n) => n.id === id)?.label ?? d.groups.find((g) => g.id === id)?.label ?? ''
  if (selection.length === 1) {
    const [node] = nodes
    const [edge] = edges
    const [group] = groups
    if (node) return `${shapeName(node.label, node.type, node.locked)}, selected`
    if (edge) return `${connectorName(label(edge.source), label(edge.target), edge.label)}, selected`
    if (group) return `${group.label.trim() || 'Untitled'}, ${group.kind === 'lane' ? 'lane' : 'group'}, selected`
  }
  const parts = [nodes.length && plural(nodes.length, 'shape'), edges.length && plural(edges.length, 'connector'), groups.length && plural(groups.length, 'group')].filter(Boolean)
  return `${parts.join(', ')} selected`
}

export const MODE_MESSAGES: Record<Tool, string> = {
  select: 'Select mode',
  pan: 'Pan mode',
  link: 'Link mode: choose a source shape, then a target',
}

/** "Undone" or "Redone" when the history moved by one step that way, otherwise null. */
export function historyMessage(previous: { past: number; future: number }, next: { past: number; future: number }): string | null {
  if (next.past === previous.past - 1 && next.future === previous.future + 1) return 'Undone'
  if (next.past === previous.past + 1 && next.future === previous.future - 1) return 'Redone'
  return null
}

/** The search count and the current match. */
export function searchMessage(count: number, index: number, currentLabel: string | undefined, hidden: number): string {
  const more = hidden ? `, ${hidden} more on hidden layers` : ''
  if (count === 0) return `No matches${more}`
  return `${index + 1} of ${count}${currentLabel !== undefined ? `: ${currentLabel.trim() || 'Untitled'}` : ''}${more}`
}

export const LOCKED_MESSAGE = 'Locked: the selection can’t move'

/** Announces selection, mode, undo and redo, and search changes. Returns a function that stops it. */
export function startAnnouncements(): () => void {
  const stops = [
    useDiagramStore.subscribe((s, prev) => {
      const history = historyMessage({ past: prev.past.length, future: prev.future.length }, { past: s.past.length, future: s.future.length })
      if (history) announce(history)
      else if (s.selection !== prev.selection) announce(selectionMessage(s.diagram, s.selection))
    }),
    useUiStore.subscribe((s, prev) => {
      if (s.tool !== prev.tool) announce(MODE_MESSAGES[s.tool])
    }),
    useSearchStore.subscribe((s, prev) => {
      if (!s.open || !s.query.trim()) return
      if (s.result === prev.result && s.index === prev.index && s.query === prev.query) return
      const hit = s.result.hits[s.index]
      const label = hit ? useDiagramStore.getState().diagram.nodes.find((n) => n.id === hit.id)?.label : undefined
      announce(searchMessage(s.result.hits.length, s.index, label, s.result.hidden.count))
    }),
  ]
  return () => stops.forEach((stop) => stop())
}
