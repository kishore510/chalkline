import { describe, expect, it } from 'vitest'
import { buildRenderModel } from '@/canvas/renderModel'
import { fixtures, legacyFixtures } from '@/fixtures'
import { loadAutosave } from '@/persistence/autosave'
import { serializeDiagram } from '@/persistence/serialize'
import { getShape, isKnownShape } from '@/shapes/registry'
import { migrate, parseDiagram, SCHEMA_VERSION } from './diagram'

const v2 = legacyFixtures['v2-container'] as { schemaVersion: number }

describe('migration v2 -> v3', () => {
  it('the fixture was saved at v2', () => {
    expect(v2.schemaVersion).toBe(2)
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(3)
  })

  it('is a version bump only', () => {
    const migrated = migrate(v2, 3) as Record<string, unknown>
    expect(migrated).toEqual({ ...v2, schemaVersion: 3 })
  })

  it('loads through parseDiagram and through a browser autosave', () => {
    const diagram = parseDiagram(v2)
    expect(diagram.schemaVersion).toBe(SCHEMA_VERSION)
    expect(diagram.nodes.map((n) => n.type)).toEqual(['rounded', 'rounded', 'database', 'actor'])
    const map = new Map([['chalkline.autosave', JSON.stringify(v2)]])
    const storage = { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), removeItem: (k: string) => void map.delete(k) }
    expect(loadAutosave(storage)).toEqual({ status: 'ok', diagram })
  })

  it('still migrates v1 documents all the way', () => {
    expect(parseDiagram(legacyFixtures['v1-web-architecture']).schemaVersion).toBe(SCHEMA_VERSION)
  })
})

describe('unknown shape ids', () => {
  const doc = parseDiagram(fixtures['unknown-shape'])
  const future = doc.nodes.find((n) => n.id === 'n_future')!

  it('load, keeping the original id', () => {
    expect(future.type).toBe('hologram')
    expect(isKnownShape('hologram')).toBe(false)
    expect(isKnownShape('rounded')).toBe(true)
  })

  it('draw as a plain rectangle', () => {
    expect(getShape('hologram').id).toBe('rectangle')
    expect(buildRenderModel(doc).routingNodes.find((n) => n.id === 'n_future')).toMatchObject({ type: 'hologram' })
  })

  it('round-trip unchanged through save and load', () => {
    const again = parseDiagram(JSON.parse(serializeDiagram(doc)))
    expect(again).toEqual(doc)
    expect(serializeDiagram(again)).toContain('"type":"hologram"')
  })
})
