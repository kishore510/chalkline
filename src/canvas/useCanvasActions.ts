import { useReactFlow, useStoreApi } from '@xyflow/react'
import { useCallback, useMemo } from 'react'
import { readToken } from '@/lib/cssVar'
import type { NodeType, Orientation } from '@/schema/diagram'
import { MEDIA } from '@/styles/breakpoints'
import { useDiagramStore } from '@/store/diagramStore'
import { explainBlockedAdd } from '@/editor/layerNotices'
import { useUiStore } from '@/store/uiStore'

const duration = () => (window.matchMedia(MEDIA.reducedMotion).matches ? 0 : readToken('--cl-duration-base', 200))
const gridSize = () => (useUiStore.getState().snapToGrid ? readToken('--cl-grid-gap', 20) : 0)

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

  return useMemo(
    () => ({
      addAtCenter,
      addAtScreenPoint,
      addPoolAtCenter,
      zoomIn: () => void flow.zoomIn({ duration: duration() }),
      zoomOut: () => void flow.zoomOut({ duration: duration() }),
      fitView: () => void flow.fitView({ padding: 0.2, duration: duration(), maxZoom: 1.5 }),
      /** Loads a document, then frames it once React Flow has laid it out. */
      load(raw: unknown) {
        useDiagramStore.getState().load(raw)
        requestAnimationFrame(() => void flow.fitView({ padding: 0.2, duration: duration(), maxZoom: 1.5 }))
      },
    }),
    [flow, addAtCenter, addAtScreenPoint, addPoolAtCenter],
  )
}
