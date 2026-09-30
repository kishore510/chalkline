import { create } from 'zustand'
import { APP_VERSION } from '@/version'
import { hasUnseenChanges, markSeen, readLastSeen } from './whatsNew'

/** A page of the help sheet. */
export type HelpView = { kind: 'home' } | { kind: 'topic'; id: string } | { kind: 'whats-new' } | { kind: 'about' }

const HOME: HelpView = { kind: 'home' }

interface HelpState {
  open: boolean
  /** Pages visited since opening, current last; Back pops one. Never empty. */
  stack: HelpView[]
  /** This version's notes haven't been opened in this browser yet (shows a dot on the help button). */
  unseen: boolean
  /** Opens the sheet, on `view` if given (with Home behind it for Back). */
  openHelp: (view?: HelpView) => void
  closeHelp: () => void
  go: (view: HelpView) => void
  back: () => void
}

/** Opening What's new counts as seeing this version's changes. */
const seen = (view: HelpView) => {
  if (view.kind !== 'whats-new') return {}
  markSeen(APP_VERSION)
  return { unseen: false }
}

export const useHelpStore = create<HelpState>()((set) => ({
  open: false,
  stack: [HOME],
  unseen: hasUnseenChanges(readLastSeen(), APP_VERSION),
  openHelp: (view = HOME) => set({ open: true, stack: view.kind === 'home' ? [HOME] : [HOME, view], ...seen(view) }),
  closeHelp: () => set({ open: false }),
  go: (view) => set((s) => ({ stack: [...s.stack, view], ...seen(view) })),
  back: () => set((s) => (s.stack.length > 1 ? { stack: s.stack.slice(0, -1) } : s)),
}))

export const currentView = (stack: HelpView[]): HelpView => stack.at(-1) ?? HOME
