import { create } from 'zustand'
import { announce } from '@/a11y/announce'
import { spokenError, type ErrorKind, type FriendlyError } from './friendly'

/*
 * Which problem is on screen. Two places: a dialog for something that just
 * failed (opening a file, restoring a backup) and a banner for an ongoing
 * problem (autosave). Both are announced through the live region. View state
 * only: never saved, never an undo step.
 */

export interface ErrorAction {
  label: string
  run: () => void
  primary?: boolean
}

export interface ShownError {
  id: number
  error: FriendlyError
  actions: ErrorAction[]
  /** An extra line, e.g. when the diagram was last saved. */
  note?: string
}

interface ErrorState {
  dialog: ShownError | null
  banner: ShownError | null
  showError: (error: FriendlyError, actions?: ErrorAction[]) => void
  closeError: () => void
  showBanner: (error: FriendlyError, actions?: ErrorAction[], note?: string) => void
  /** Hides the banner (only if it's showing one of `kinds`, when given). */
  clearBanner: (kinds?: ErrorKind[]) => void
}

let nextId = 1

export const useErrorStore = create<ErrorState>()((set, get) => ({
  dialog: null,
  banner: null,
  showError(error, actions = []) {
    set({ dialog: { id: nextId++, error, actions } })
    announce(spokenError(error))
  },
  closeError: () => set({ dialog: null }),
  showBanner(error, actions = [], note) {
    set({ banner: { id: nextId++, error, actions, ...(note && { note }) } })
    announce(spokenError(error))
  },
  clearBanner(kinds) {
    const banner = get().banner
    if (banner && (!kinds || kinds.includes(banner.error.kind))) set({ banner: null })
  },
}))

export const showError = (error: FriendlyError, actions?: ErrorAction[]) => useErrorStore.getState().showError(error, actions)
