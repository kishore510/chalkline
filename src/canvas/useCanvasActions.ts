import { useReactFlow, useStoreApi } from '@xyflow/react'
import { useCallback, useMemo } from 'react'
import { readToken } from '@/lib/cssVar'
import type { NodeType, Orientation, Position } from '@/schema/diagram'
import { announce, LOCKED_MESSAGE } from '@/a11y/announce'
import { motionMs } from '@/lib/motion'
import { useDiagramStore } from '@/store/diagramStore'
import { explainBlockedAdd } from '@/editor/layerNotices'
import { useUiStore } from '@/store/uiStore'
import type { StencilContent } from '@/stencils/format'
import { unionBox } from '@/store/groups'
import { centreViewport, focusZoom, revealViewport } from './floating'
import { snapContext, useGuideStore, VIEW_MARGIN, visibleBox } from './guideSession'
import type { GuideResult } from './guides'
import { guideTargets } from './guideTargets'
import { nudgeItems, nudgeStep, planNudge } from './nudge'
import { buildRenderModel, collapsedBox } from './renderModel'

const duration = () => motionMs('--cl-duration-base')
const gridSize = () => (useUiStore.getState().snapToGrid ? readToken('--cl-grid-gap', 20) : 0)

/** A found item is shown at least this zoom, so its label can be read. */
const FOCUS_MIN_ZOOM = 0.75

// Guides from a nudge stay up briefly after the last key press.
let nudgeGuidesTimer: ReturnType<typeof setTimeout> | undefined
function showNudgeGuides(guides: GuideResult | null) {
  clearTimeout(nudgeGuidesTimer)
  const { gesture, setOverlay } = useGuideStore.getState()
  if (gesture) return
  setOverlay(guides)
  nudgeGuidesTimer = setTimeout(() => {
    if (!useGuideStore.getState().gesture) setOverlay(null)
  }, readToken('--cl-duration-slow', 400) * 2)
}

/** Canvas commands shared by the palette, toolbars and empty state. */
export function useCanvasActions() {
  const flow = useReactFlow()
  const rfStore = useStoreApi()

  const addAtCenter = useCallback(
    (type: NodeType) => {
      const rect = rfStore.getState().domNode?.getBoundingClientRect()
      if (!rect) return
      const center = flow.screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
      if (!useDiagramStore.getState().addNode(type, center, gridSize())) explainBlockedAdd()
    },
    [flow, rfStore],
  )

  /** Adds a swimlane pool (three lanes) at the centre of the view. */
  const addPoolAtCenter = useCallback(
    (orientation: Orientation) => {
      const rect = rfStore.getState().domNode?.getBoundingClientRect()
      if (!rect) return
      const center = flow.screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
      if (!useDiagramStore.getState().addPool(center, orientation)) explainBlockedAdd()
    },
    [flow, rfStore],
  )

  /**
   * Inserts stencil content at the centre of the view, selects it, and fits
   * the view to it if it doesn't fit. Returns false (with the layer message)
   * if the active layer can't take it.
   */
  const insertStencilAtCenter = useCallback(
    (content: StencilContent) => {
      const rect = rfStore.getState().domNode?.getBoundingClientRect()
      if (!rect) return false
      const center = flow.screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
      const ids = useDiagramStore.getState().insertStencil(content, center, gridSize())
      if (!ids) {
        explainBlockedAdd()
        return false
      }
      const added = new Set(ids)
      const { diagram } = useDiagramStore.getState()
      const bounds = unionBox([...diagram.nodes, ...diagram.groups].filter((i) => added.has(i.id)).map((i) => ({ ...i.position, ...i.size })))
      if (bounds && revealViewport(bounds, flow.getViewport(), rect, readToken('--cl-gutter', 16))) {
        void flow.fitBounds(bounds, { padding: 0.2, duration: duration() })
      }
      return true
    },
    [flow, rfStore],
  )

  /** Adds a node where a palette item was dropped. Returns false if the point is not over the canvas. */
  const addAtScreenPoint = useCallback(
    (type: NodeType, x: number, y: number) => {
      const hit = document.elementFromPoint(x, y)
      if (!hit?.closest('.react-flow')) return false
      if (useDiagramStore.getState().addNode(type, flow.screenToFlowPosition({ x, y }), gridSize())) return true
      explainBlockedAdd()
      return false
    },
    [flow],
  )

  /**
   * Nudges the selection one step (`direction` is a unit vector), snapped as a
   * drag to the same spot would be. Locked and hidden items stay; if nothing
   * can move, nothing happens. Returns false if nothing is selected.
   */
  const nudge = useCallback(
    (direction: Position, far: boolean) => {
      const { diagram, selection } = useDiagramStore.getState()
      if (selection.length === 0) return false
      const rf = rfStore.getState()
      const zoom = rf.transform[2]
      const ctx = snapContext(zoom, readToken('--cl-grid-gap', 20))
      const step = nudgeStep(ctx.grid, far)
      const model = buildRenderModel(diagram)
      const items = nudgeItems(diagram, model, selection)
      const targets = guideTargets(diagram, model, items, visibleBox(rf), VIEW_MARGIN / zoom)
      const plan = planNudge(diagram, model, items, { x: direction.x * step, y: direction.y * step }, targets, ctx)
      // Nothing can move: say why to screen readers only (sighted users see the padlocks).
      if (!plan) {
        if (items.length === 0 && selection.some((id) => diagram.nodes.some((n) => n.id === id) || diagram.groups.some((g) => g.id === id))) announce(LOCKED_MESSAGE)
        return true
      }
      useDiagramStore.getState().nudge(plan.moves)
      showNudgeGuides(plan.guides)
      return true
    },
    [rfStore],
  )

  /**
   * Centres shapes, groups or connectors (all of them together) in the
   * visible part of the canvas (above `coveredBelow`, the screen y where a
   * bottom sheet starts), zooming in to a readable size if needed and out if
   * they don't fit.
   */
  const revealItems = useCallback(
    (ids: readonly string[], coveredBelow?: number) => {
      const { diagram } = useDiagramStore.getState()
      const boxOf = (id: string) => {
        const group = diagram.groups.find((g) => g.id === id)
        if (group) return group.collapsed ? collapsedBox(group) : { ...group.position, ...group.size }
        const node = diagram.nodes.find((n) => n.id === id)
        return node ? { ...node.position, ...node.size } : null
      }
      const boxes = ids.flatMap((id) => {
        const edge = diagram.edges.find((e) => e.id === id)
        return (edge ? [boxOf(edge.source), boxOf(edge.target)] : [boxOf(id)]).filter((b) => b !== null)
      })
      const bounds = unionBox(boxes.map((b) => ({ x: b.x, y: b.y, width: b.width, height: b.height })))
      const rect = rfStore.getState().domNode?.getBoundingClientRect()
      if (!bounds || !rect) return
      const visible = { width: rect.width, height: coveredBelow === undefined ? rect.height : Math.max(0, Math.min(rect.height, coveredBelow - rect.top)) }
      const zoom = focusZoom(bounds, flow.getViewport().zoom, visible, readToken('--cl-gutter', 16), FOCUS_MIN_ZOOM)
      void flow.setViewport(centreViewport(bounds, zoom, visible), { duration: duration() })
    },
    [flow, rfStore],
  )

  /** Centres one shape or group (see revealItems). */
  const revealItem = useCallback((id: string, coveredBelow?: number) => revealItems([id], coveredBelow), [revealItems])

  return useMemo(
    () => ({
      addAtCenter,
      addAtScreenPoint,
      addPoolAtCenter,
      insertStencilAtCenter,
      nudge,
      revealItem,
      revealItems,
      zoomIn: () => void flow.zoomIn({ duration: duration() }),
      zoomOut: () => void flow.zoomOut({ duration: duration() }),
      fitView: () => void flow.fitView({ padding: 0.2, duration: duration(), maxZoom: 1.5 }),
      /** Loads a document, then frames it once React Flow has laid it out. */
      load(raw: unknown) {
        useDiagramStore.getState().load(raw)
        requestAnimationFrame(() => void flow.fitView({ padding: 0.2, duration: duration(), maxZoom: 1.5 }))
      },
    }),
    [flow, addAtCenter, addAtScreenPoint, addPoolAtCenter, insertStencilAtCenter, nudge, revealItem, revealItems],
  )
}
