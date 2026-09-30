import { create } from 'zustand'
import { useDiagramStore } from '@/store/diagramStore'
import type { Box } from '@/store/groups'
import type { GuideLine, GuideTarget, Measure } from './guides'
import type { Targets } from './guideTargets'

/*
 * Live state of a drag or resize gesture: what the guide overlay draws, plus
 * a cache of targets for the gesture. View state only; never saved.
 * Kept apart from the UI store so per-frame updates don't reach its many subscribers.
 */

export interface GuideOverlay {
  lines: GuideLine[]
  measures: Measure[]
  aligned: GuideTarget[]
}

interface GuideState {
  /** A drag or resize is in progress (the canvas snaps it, not React Flow). */
  gesture: 'drag' | 'resize' | null
  overlay: GuideOverlay | null
  setOverlay: (overlay: GuideOverlay | null) => void
}

export const useGuideStore = create<GuideState>()((set) => ({
  gesture: null,
  overlay: null,
  setOverlay: (overlay) =>
    set((s) => {
      const empty = !overlay || (overlay.lines.length === 0 && overlay.measures.length === 0)
      if (empty) return s.overlay ? { overlay: null } : s
      return { overlay }
    }),
}))

/** Per-gesture cache: targets don't change while the same items move. */
export const session: { key: string; targets: Targets | null; resizeStart: Map<string, Box> } = {
  key: '',
  targets: null,
  resizeStart: new Map(),
}

export function beginGesture(kind: 'drag' | 'resize') {
  session.key = ''
  session.targets = null
  session.resizeStart.clear()
  useGuideStore.setState({ gesture: kind, overlay: null })
}

/** Guides disappear immediately on release. */
export function endGesture() {
  session.key = ''
  session.targets = null
  session.resizeStart.clear()
  useGuideStore.setState({ gesture: null, overlay: null })
}

/** A resize gesture is one undo step, snapped like a drag. */
export function startResize() {
  useDiagramStore.getState().beginBatch()
  beginGesture('resize')
}

export function endResize() {
  endGesture()
  useDiagramStore.getState().endBatch()
}
