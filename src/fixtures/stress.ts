import { DEFAULT_LAYER_ID, SCHEMA_VERSION, type Diagram, type DiagramEdge, type DiagramGroup, type DiagramNode } from '@/schema/diagram'
import { FONTS } from '@/fonts/registry'
import { SHAPES } from '@/shapes/registry'

/*
 * Generated stress diagrams for checking performance: `count` shapes in a
 * grid, connectors between neighbours, a few containers, three layers (one
 * hidden) and a mix of shapes and fonts. Deterministic (seeded), and built in
 * code rather than saved, so nothing large lives in the repo. Opened with
 * #/fixture/stress-300 or #/fixture/stress-1000.
 */

/** Small seeded generator (mulberry32), so the same count always gives the same diagram. */
function random(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const WORDS = ['Orders', 'Payments', 'Gateway', 'Ledger', 'Cache', 'Queue', 'Search', 'Auth', 'Billing', 'Reports', 'Inventory', 'Users', 'Events', 'Mail', 'Files']

/**
 * Shapes added to the registry after export/golden.json was made. Left out so
 * the stress diagrams, and the hashes that guard their output, stay the same
 * as the registry grows.
 */
const ADDED_SINCE_GOLDEN = new Set(['mcp-client', 'mcp-server', 'tool'])

export const STRESS_SIZES = [300, 1000] as const

export function stressDiagram(count: number, seed = 1): Diagram {
  const rand = random(seed + count)
  const pick = <T,>(items: readonly T[]) => items[Math.floor(rand() * items.length)]!
  const cols = Math.ceil(Math.sqrt(count))
  const shapes = SHAPES.filter((s) => !s.keepAspect && !ADDED_SINCE_GOLDEN.has(s.id))
  const at = '2026-01-01T00:00:00.000Z'
  const layers = [
    { id: DEFAULT_LAYER_ID, name: 'Base', visible: true, locked: false },
    { id: 'l_overlay', name: 'Overlay', visible: true, locked: false },
    { id: 'l_hidden', name: 'Hidden notes', visible: false, locked: false },
  ]

  // A container around each 6x4 block in the first few rows.
  const groups: DiagramGroup[] = []
  const groupOf = new Map<number, string>()
  const blocks = Math.min(6, Math.floor(cols / 6))
  for (let b = 0; b < blocks; b++) {
    const id = `g_${b}`
    groups.push({ id, label: `Area ${b + 1}`, kind: 'container', locked: false, collapsed: b === blocks - 1, position: { x: b * 6 * 220 - 20, y: -60 }, size: { width: 6 * 220 - 20, height: 4 * 140 + 60 }, style: {} })
    for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) groupOf.set(r * cols + b * 6 + c, id)
  }

  const nodes: DiagramNode[] = []
  for (let i = 0; i < count; i++) {
    const shape = pick(shapes)
    const r = rand()
    const font = r < 0.7 ? undefined : pick(FONTS).id
    const groupId = groupOf.get(i)
    nodes.push({
      id: `n_${i}`,
      type: shape.id,
      position: { x: (i % cols) * 220, y: Math.floor(i / cols) * 140 },
      size: { width: 160, height: 80 },
      label: `${pick(WORDS)} ${i}`,
      notes: i % 9 === 0 ? `Owned by team ${i % 13}` : '',
      style: font ? { fontFamily: font, ...(rand() < 0.3 && { fontWeight: 700 as const }) } : {},
      locked: i % 50 === 0,
      ...(groupId && { groupId }),
      ...(!groupId && i % 17 === 0 && { layerId: 'l_overlay' }),
      ...(!groupId && i % 23 === 0 && { layerId: 'l_hidden' }),
    })
  }

  const edges: DiagramEdge[] = []
  for (let i = 0; i < count; i++) {
    const right = i + 1
    const below = i + cols
    if ((i + 1) % cols !== 0 && right < count && rand() < 0.6) edges.push({ id: `e_${i}_r`, source: `n_${i}`, target: `n_${right}`, label: rand() < 0.1 ? 'calls' : '', notes: '', style: {} })
    if (below < count && rand() < 0.4) edges.push({ id: `e_${i}_d`, source: `n_${i}`, target: `n_${below}`, label: '', notes: '', style: {} })
  }

  return { schemaVersion: SCHEMA_VERSION, meta: { title: `Stress test (${count} shapes)`, created: at, updated: at }, nodes, edges, groups, layers }
}
