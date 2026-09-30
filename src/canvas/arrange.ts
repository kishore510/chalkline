import type { Position, Size } from '@/schema/diagram'

/*
 * Alignment, distribution and size matching for a multi-selection. Pure: each
 * returns the new positions or sizes for the nodes it changes, relative to the
 * selection's own bounding box. Values are exact; nothing is snapped.
 */

export interface Arrangeable {
  id: string
  position: Position
  size: Size
}

export const ALIGN_MODES = ['left', 'centre', 'right', 'top', 'middle', 'bottom'] as const
export type AlignMode = (typeof ALIGN_MODES)[number]
export type Axis = 'horizontal' | 'vertical'
export type MatchMode = 'width' | 'height' | 'both'

function bounds(nodes: readonly Arrangeable[]) {
  const left = Math.min(...nodes.map((n) => n.position.x))
  const top = Math.min(...nodes.map((n) => n.position.y))
  const right = Math.max(...nodes.map((n) => n.position.x + n.size.width))
  const bottom = Math.max(...nodes.map((n) => n.position.y + n.size.height))
  return { left, top, right, bottom }
}

/** Lines the nodes up on one edge or centre line of their bounding box. Needs 2+ nodes. */
export function align(nodes: readonly Arrangeable[], mode: AlignMode): Map<string, Position> {
  const moves = new Map<string, Position>()
  if (nodes.length < 2) return moves
  const b = bounds(nodes)
  for (const { id, position: { x, y }, size: { width, height } } of nodes) {
    switch (mode) {
      case 'left':
        moves.set(id, { x: b.left, y })
        break
      case 'centre':
        moves.set(id, { x: (b.left + b.right) / 2 - width / 2, y })
        break
      case 'right':
        moves.set(id, { x: b.right - width, y })
        break
      case 'top':
        moves.set(id, { x, y: b.top })
        break
      case 'middle':
        moves.set(id, { x, y: (b.top + b.bottom) / 2 - height / 2 })
        break
      case 'bottom':
        moves.set(id, { x, y: b.bottom - height })
        break
    }
  }
  return moves
}

/**
 * Spaces nodes so the gaps between them are equal along an axis, taking their
 * sizes into account. Nodes are ordered by centre; the first and last stay
 * where they are. Needs 3+ nodes.
 */
export function distribute(nodes: readonly Arrangeable[], axis: Axis): Map<string, Position> {
  const moves = new Map<string, Position>()
  if (nodes.length < 3) return moves
  const start = (n: Arrangeable) => (axis === 'horizontal' ? n.position.x : n.position.y)
  const length = (n: Arrangeable) => (axis === 'horizontal' ? n.size.width : n.size.height)
  const sorted = [...nodes].sort((a, b) => start(a) + length(a) / 2 - (start(b) + length(b) / 2))
  const first = sorted[0]!
  const last = sorted.at(-1)!
  const span = start(last) + length(last) - start(first)
  const gap = (span - sorted.reduce((sum, n) => sum + length(n), 0)) / (sorted.length - 1)
  let cursor = start(first)
  sorted.forEach((n, i) => {
    // Keep the outermost two exactly where they are.
    const at = i === sorted.length - 1 ? start(last) : cursor
    moves.set(n.id, axis === 'horizontal' ? { x: at, y: n.position.y } : { x: n.position.x, y: at })
    cursor += length(n) + gap
  })
  return moves
}

/** Resizes nodes to the largest width, height or both in the selection. Needs 2+ nodes. */
export function matchSize(nodes: readonly Arrangeable[], mode: MatchMode): Map<string, Size> {
  const sizes = new Map<string, Size>()
  if (nodes.length < 2) return sizes
  const width = Math.max(...nodes.map((n) => n.size.width))
  const height = Math.max(...nodes.map((n) => n.size.height))
  for (const n of nodes) {
    sizes.set(n.id, {
      width: mode === 'height' ? n.size.width : width,
      height: mode === 'width' ? n.size.height : height,
    })
  }
  return sizes
}
