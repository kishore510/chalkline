import { useMemo, useRef } from 'react'
import { readToken } from '@/lib/cssVar'

export interface PressTarget {
  id: string
  kind: 'node' | 'edge'
}

// How far a finger may drift (in CSS px) before the press counts as a drag.
const MOVE_TOLERANCE = 10

function findTarget(target: EventTarget | null): PressTarget | null {
  if (!(target instanceof Element)) return null
  const node = target.closest<HTMLElement>('.react-flow__node')
  if (node?.dataset.id) return { id: node.dataset.id, kind: 'node' }
  const edge = target.closest<SVGElement>('.react-flow__edge')
  if (edge?.dataset.id) return { id: edge.dataset.id, kind: 'edge' }
  return null
}

/**
 * Long-press on a node or edge (touch and pen only), standing in for right-click.
 * Returns capture-phase pointer handlers for the canvas wrapper.
 */
export function useLongPress(onLongPress: (target: PressTarget, x: number, y: number) => void) {
  const state = useRef<{ timer: number; x: number; y: number } | null>(null)
  const callback = useRef(onLongPress)
  callback.current = onLongPress

  return useMemo(() => {
    const cancel = () => {
      if (state.current) window.clearTimeout(state.current.timer)
      state.current = null
    }
    return {
      onPointerDownCapture(e: React.PointerEvent) {
        cancel()
        if (e.pointerType === 'mouse' || !e.isPrimary) return
        const target = findTarget(e.target)
        if (!target) return
        const { clientX: x, clientY: y } = e
        const timer = window.setTimeout(() => {
          state.current = null
          callback.current(target, x, y)
        }, readToken('--cl-long-press', 500))
        state.current = { timer, x, y }
      },
      onPointerMoveCapture(e: React.PointerEvent) {
        const s = state.current
        if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > MOVE_TOLERANCE) cancel()
      },
      onPointerUpCapture: cancel,
      onPointerCancelCapture: cancel,
    }
  }, [])
}
