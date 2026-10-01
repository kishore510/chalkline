import { create } from 'zustand'
import { useDiagramStore } from '@/store/diagramStore'
import type { Box } from '@/store/groups'
import { useUiStore } from '@/store/uiStore'
import type { GuideLine, GuideTarget, Measure } from './guides'
import type { SnapContext, Targets } from './guideTargets'

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

/** Alt (Option) held: smart guides pause while dragging. Desktop only; touch has no Alt key. Kept current by the canvas. */
export const keys = { altHeld: false }

/** Targets this far past the screen edge (screen px) still count, so guides don't pop in and out at the edge. */
export const VIEW_MARGIN = 200

/** The React Flow viewport, as its store holds it. */
export interface FlowView {
  transform: [number, number, number]
  width: number
  height: number
}

/** The visible part of the canvas, in canvas coordinates. */
export function visibleBox({ transform: [tx, ty, zoom], width, height }: FlowView): Box {
  return { x: -tx / zoom, y: -ty / zoom, width: width / zoom, height: height / zoom }
}

/** How a drag (or a nudge) snaps right now: the zoom and the user's guide and grid choices. */
export function snapContext(zoom: number, grid: number): SnapContext {
  const ui = useUiStore.getState()
  return { zoom, guides: ui.smartGuides && !keys.altHeld, grid: ui.snapToGrid ? grid : 0 }
}
