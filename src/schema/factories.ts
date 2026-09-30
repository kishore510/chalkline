import { createId } from '@/lib/id'
import {
  SCHEMA_VERSION,
  type Diagram,
  type DiagramEdge,
  type DiagramNode,
  type NodeShape,
  type Point,
  type Size,
} from './diagram'

/** Sensible default size per shape, so new nodes look right with no styling. */
export const DEFAULT_NODE_SIZE: Record<NodeShape, Size> = {
  rectangle: { width: 160, height: 80 },
  rounded: { width: 160, height: 80 },
  database: { width: 120, height: 100 },
  cloud: { width: 180, height: 110 },
  actor: { width: 64, height: 112 },
  text: { width: 160, height: 40 },
}

export const DEFAULT_NODE_LABEL: Record<NodeShape, string> = {
  rectangle: 'Service',
  rounded: 'Process',
  database: 'Database',
  cloud: 'Cloud',
  actor: 'User',
  text: 'Text',
}

export function createDiagram(overrides: Partial<Omit<Diagram, 'schemaVersion'>> = {}): Diagram {
  const now = new Date().toISOString()
  return {
    schemaVersion: SCHEMA_VERSION,
    id: createId('d_'),
    title: 'Untitled diagram',
    createdAt: now,
    updatedAt: now,
    nodes: [],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    ...overrides,
  }
}

export function createNode(
  shape: NodeShape,
  position: Point,
  overrides: Partial<Omit<DiagramNode, 'shape' | 'position'>> = {},
): DiagramNode {
  return {
    id: createId('n_'),
    shape,
    position,
    size: { ...DEFAULT_NODE_SIZE[shape] },
    label: DEFAULT_NODE_LABEL[shape],
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
    markerStart: 'none',
    markerEnd: 'arrow',
    ...overrides,
  }
}
