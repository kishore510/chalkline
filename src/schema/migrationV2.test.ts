import { describe, expect, it } from 'vitest'
import { fixtures, legacyFixtures } from '@/fixtures'
import { loadAutosave } from '@/persistence/autosave'
import { DiagramSchema, migrate, parseDiagram, SCHEMA_VERSION, type DiagramInput } from './diagram'

const legacy = legacyFixtures['v1-web-architecture'] as { schemaVersion: number; nodes: unknown[]; groups: unknown[] }
const issuesOf = (input: unknown) => {
  const r = DiagramSchema.safeParse(input)
  return r.success ? [] : r.error.issues.map((i) => i.message)
}

describe('migration v1 -> v2', () => {
  it('the legacy fixture really is a v1 document', () => {
    expect(legacy.schemaVersion).toBe(1)
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(2)
  })

  it('turns existing groups into unlocked containers and leaves everything else alone', () => {
    const migrated = migrate(legacy) as { schemaVersion: number; nodes: Record<string, unknown>[]; groups: Record<string, unknown>[] }
    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION)
    expect(migrated.groups).toEqual([{ ...(legacy.groups[0] as object), kind: 'container', locked: false }])
    migrated.nodes.forEach((node, i) => expect(node).toEqual({ ...(legacy.nodes[i] as object), locked: false }))
  })

  it('loads through parseDiagram with nodes still in their group', () => {
    const diagram = parseDiagram(legacy)
    expect(diagram.schemaVersion).toBe(SCHEMA_VERSION)
    expect(diagram.groups[0]).toMatchObject({ id: 'g_backend', kind: 'container', locked: false, collapsed: false })
    expect(diagram.nodes.filter((n) => n.groupId === 'g_backend').map((n) => n.id)).toEqual(['api', 'db'])
    expect(diagram.nodes.every((n) => n.locked === false)).toBe(true)
  })

  it('loads a v1 autosave from browser storage', () => {
    const map = new Map([['chalkline.autosave', JSON.stringify(legacy)]])
    const storage = { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), removeItem: (k: string) => void map.delete(k) }
    const result = loadAutosave(storage)
    const diagram = result.status === 'ok' ? result.diagram : undefined
    expect(diagram?.schemaVersion).toBe(SCHEMA_VERSION)
    expect(diagram?.groups[0]?.kind).toBe('container')
  })

  it('migrates a v1 document without groups', () => {
    const { groups: _groups, ...noGroups } = legacy
    const nodes = (legacy.nodes as Record<string, unknown>[]).map(({ groupId: _g, ...n }) => n)
    expect(parseDiagram({ ...noGroups, nodes }).groups).toEqual([])
  })
})

describe('group rules', () => {
  const pool = () => structuredClone(fixtures['swimlane-pool']) as DiagramInput & { groups: NonNullable<DiagramInput['groups']> }

  it('accepts the new fixtures', () => {
    expect(issuesOf(fixtures.container)).toEqual([])
    expect(issuesOf(fixtures['swimlane-pool'])).toEqual([])
  })

  it('rejects an unknown parent', () => {
    const doc = pool()
    doc.groups[1]!.parentId = 'g_missing'
    expect(issuesOf(doc)).toContain('Unknown parent group "g_missing"')
  })

  it('rejects a lane that is not inside a container', () => {
    const doc = pool()
    delete doc.groups[1]!.parentId
    expect(issuesOf(doc)).toContain('Lane "g_lane_channels" must be inside a container')
    const inLane = pool()
    inLane.groups[2]!.parentId = 'g_lane_channels'
    expect(issuesOf(inLane)).toContain('Parent "g_lane_channels" of "g_lane_integration" must be a container')
  })

  it('rejects a container inside a lane', () => {
    const doc = pool()
    doc.groups.push({ id: 'g_box', kind: 'container', parentId: 'g_lane_data', position: { x: 0, y: 0 }, size: { width: 10, height: 10 } })
    expect(issuesOf(doc)).toContain('Parent "g_lane_data" of "g_box" must be a container')
  })

  it('rejects parent cycles', () => {
    const doc = pool()
    doc.groups.push(
      { id: 'g_a', parentId: 'g_b', position: { x: 0, y: 0 }, size: { width: 10, height: 10 } },
      { id: 'g_b', parentId: 'g_a', position: { x: 0, y: 0 }, size: { width: 10, height: 10 } },
    )
    expect(issuesOf(doc).filter((m) => m.includes('inside itself'))).toHaveLength(2)
  })

  it('rejects a node in an unknown group, and ids shared by a node and a group', () => {
    const doc = pool()
    doc.nodes[0]!.groupId = 'g_nope'
    doc.nodes[1]!.id = 'g_pool'
    const issues = issuesOf(doc)
    expect(issues).toContain('Unknown group "g_nope"')
    expect(issues).toContain('Node id "g_pool" is also a group id')
  })
})
