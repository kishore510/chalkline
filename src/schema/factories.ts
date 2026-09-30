import { createId } from '@/lib/id'
import { getShape } from '@/shapes/registry'
import type { DiagramEdge, DiagramNode, NodeType, Position } from './diagram'

export function createNode(
  type: NodeType,
  position: Position,
  overrides: Partial<Omit<DiagramNode, 'type' | 'position'>> = {},
): DiagramNode {
  const shape = getShape(type)
  return {
    id: createId('n_'),
    type,
    position,
    size: { ...shape.defaultSize },
    label: shape.defaultLabel,
    notes: '',
    style: { ...shape.defaultStyle },
    locked: false,
    ...overrides,
  }
}

export function createEdge(
  source: string,
  target: string,
  overrides: Partial<Omit<DiagramEdge, 'source' | 'target'>> = {},
): DiagramEdge {
  return {
    id: createId('e_'),
    source,
    target,
    label: '',
    notes: '',
    style: {},
    ...overrides,
  }
}

/** Smallest size the resize handles allow, so a node never becomes unclickable. */
export const MIN_NODE_SIZE = 24
