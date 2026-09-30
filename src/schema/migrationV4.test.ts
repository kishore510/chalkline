import { describe, expect, it } from 'vitest'
import { fixtures, legacyFixtures } from '@/fixtures'
import { loadAutosave } from '@/persistence/autosave'
import { serializeDiagram } from '@/persistence/serialize'
import { DEFAULT_LAYER_ID, DiagramSchema, MAX_LAYERS, migrate, parseDiagram, SCHEMA_VERSION, type Diagram } from './diagram'

const v3 = legacyFixtures['v3-process-flow'] as { schemaVersion: number; nodes: unknown[] }
const issues = (doc: unknown) => {
  const r = DiagramSchema.safeParse(doc)
  return r.success ? [] : r.error.issues.map((i) => i.message)
}

describe('migration v3 -> v4', () => {
  it('the fixture was saved at v3', () => {
    expect(v3.schemaVersion).toBe(3)
    expect(SCHEMA_VERSION).toBe(4)
  })

  it('adds just the default layer and changes nothing else', () => {
    expect(migrate(v3)).toEqual({ ...v3, schemaVersion: 4, layers: [{ id: 'default', name: 'Base', visible: true, locked: false }] })
  })

  it('loads through file import and through a browser autosave', () => {
    const diagram = parseDiagram(v3)
    expect(diagram.layers.map((l) => l.id)).toEqual([DEFAULT_LAYER_ID])
    expect(diagram.nodes.every((n) => n.layerId === undefined)).toBe(true)
    const map = new Map([['chalkline.autosave', JSON.stringify(v3)]])
    const storage = { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), removeItem: (k: string) => void map.delete(k) }
    expect(loadAutosave(storage)).toEqual(diagram)
  })

  it('migrates every older version all the way', () => {
    for (const legacy of Object.values(legacyFixtures)) expect(parseDiagram(legacy).layers[0]!.id).toBe(DEFAULT_LAYER_ID)
  })
})

describe('layer rules', () => {
  const layered = () => parseDiagram(fixtures.layers)

  it('accepts the three-layer fixture and round-trips it', () => {
    const d = layered()
    expect(d.layers.map((l) => l.name)).toEqual(['Base', 'Security overlay', 'Notes'])
    expect(d.layers[2]!.visible).toBe(false)
    expect(parseDiagram(JSON.parse(serializeDiagram(d)))).toEqual(d)
  })

  it('gives documents without layers the default layer', () => {
    const { layers: _l, ...rest } = layered()
    const d = parseDiagram({ ...rest, nodes: rest.nodes.map(({ layerId: _x, ...n }) => n), edges: rest.edges.map(({ layerId: _x, ...e }) => e), groups: rest.groups.map(({ layerId: _x, ...g }) => g) })
    expect(d.layers).toEqual([{ id: 'default', name: 'Base', visible: true, locked: false }])
  })

  it('rejects an unknown layerId on nodes, edges and groups', () => {
    const d: Diagram = layered()
    d.nodes[0] = { ...d.nodes[0]!, layerId: 'l_missing' }
    d.edges[0] = { ...d.edges[0]!, layerId: 'l_missing' }
    d.groups[0] = { ...d.groups[0]!, layerId: 'l_missing' }
    expect(issues(d).filter((m) => m === 'Unknown layer "l_missing"')).toHaveLength(3)
  })

  it('rejects duplicate layer ids and a missing default layer', () => {
    const d = layered()
    expect(issues({ ...d, layers: [...d.layers, { ...d.layers[1]! }] })).toContain('Duplicate layer id "l_security"')
    expect(issues({ ...d, layers: d.layers.slice(1) })).toContain('The default layer is missing')
  })

  it(`allows at most ${MAX_LAYERS} layers`, () => {
    const d = parseDiagram(fixtures.empty)
    const many = Array.from({ length: MAX_LAYERS }, (_, i) => ({ id: `l_${i}`, name: `L${i}`, visible: true, locked: false }))
    expect(issues({ ...d, layers: [...d.layers, ...many.slice(0, MAX_LAYERS - 1)] })).toEqual([])
    expect(issues({ ...d, layers: [...d.layers, ...many] })).toContain(`At most ${MAX_LAYERS} layers`)
  })
})
