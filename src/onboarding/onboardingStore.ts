import { create } from 'zustand'
import { getSettings, updateSettings } from '@/settings/settingsStore'
import { useDiagramStore } from '@/store/diagramStore'
import { foundSavedWork, shouldWelcome, type StartupLoad } from './firstRun'

/*
 * The first-run welcome and the tour of the three modes. View state only:
 * not part of the diagram, not an undo step. Only "done" flags are kept, in settings.
 */

interface OnboardingState {
  /** The first-run welcome is showing on the empty canvas. */
  welcome: boolean
  tourOpen: boolean
  /** Ends the welcome for good (any action on it, or the diagram getting content). */
  dismissWelcome: () => void
  startTour: () => void
  /** `finished`: went through every step (rather than skipping). Either way it's not offered again unprompted. */
  closeTour: (finished: boolean) => void
}

export const useOnboardingStore = create<OnboardingState>()((set, get) => ({
  welcome: false,
  tourOpen: false,
  dismissWelcome() {
    if (get().welcome) set({ welcome: false })
    if (!getSettings().onboarding.firstRunDone) updateSettings({ onboarding: { firstRunDone: true } })
  },
  startTour() {
    get().dismissWelcome()
    // The mode switch must be visible: the phone hides the toolbar while something is selected.
    useDiagramStore.getState().setSelection([])
    set({ tourOpen: true })
  },
  closeTour(finished) {
    set({ tourOpen: false })
    if (finished || !getSettings().onboarding.tourDone) updateSettings({ onboarding: { tourDone: true } })
  },
}))

/** Decides on the welcome once the starting diagram is known. Returns a stop function. */
export function startOnboarding(startup: StartupLoad): () => void {
  if (foundSavedWork(startup) && !getSettings().onboarding.firstRunDone) updateSettings({ onboarding: { firstRunDone: true } })
  const empty = useDiagramStore.getState().diagram.nodes.length === 0
  if (!shouldWelcome(getSettings().onboarding.firstRunDone, startup, empty)) return () => {}
  useOnboardingStore.setState({ welcome: true })
  // Anything that gives the diagram content (a shape, a template, a sample, an opened file) ends the welcome.
  const stop = useDiagramStore.subscribe((s) => {
    if (s.diagram.nodes.length === 0 && s.diagram.groups.length === 0) return
    stop()
    useOnboardingStore.getState().dismissWelcome()
  })
  return stop
}
