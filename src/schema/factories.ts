import { createId } from '@/lib/id'
import type { DiagramEdge, DiagramNode, NodeType, Position, Size } from './diagram'

/** Sensible default size per node type, so new nodes look right with no styling. */
export const DEFAULT_NODE_SIZE: Record<NodeType, Size> = {
  rectangle: { width: 160, height: 80 },
  rounded: { width: 160, height: 80 },
  database: { width: 120, height: 100 },
  cloud: { width: 180, height: 110 },
  actor: { width: 96, height: 128 },
  text: { width: 160, height: 40 },
}

export const DEFAULT_NODE_LABEL: Record<NodeType, string> = {
  rectangle: 'Service',
  rounded: 'Process',
  database: 'Database',
  cloud: 'Cloud',
  actor: 'User',
  text: 'Text',
}

export function createNode(
  type: NodeType,
  position: Position,
  overrides: Partial<Omit<DiagramNode, 'type' | 'position'>> = {},
): DiagramNode {
  return {
    id: createId('n_'),
    type,
    position,
    size: { ...DEFAULT_NODE_SIZE[type] },
    label: DEFAULT_NODE_LABEL[type],
    notes: '',
    style: {},
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
