import { Position } from '@xyflow/react'

/** Connection points on every node. The ids are what edges store as sourceHandle/targetHandle. */
export const HANDLE_SIDES = ['top', 'right', 'bottom', 'left'] as const
export type HandleSide = (typeof HANDLE_SIDES)[number]

export const HANDLE_POSITION: Record<HandleSide, Position> = {
  top: Position.Top,
  right: Position.Right,
  bottom: Position.Bottom,
  left: Position.Left,
}
