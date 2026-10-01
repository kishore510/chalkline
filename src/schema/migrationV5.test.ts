import { describe, expect, it } from 'vitest'
import { fixtures, legacyFixtures } from '@/fixtures'
import { loadAutosave } from '@/persistence/autosave'
import { serializeDiagram } from '@/persistence/serialize'
import { DiagramSchema, migrate, parseDiagram, SCHEMA_VERSION } from './diagram'

const v4 = legacyFixtures['v4-layers'] as { schemaVersion: number }

describe('migration v4 -> v5', () => {
  it('the fixture was saved at v4, and v5 is current', () => {
    expect(v4.schemaVersion).toBe(4)
    expect(SCHEMA_VERSION).toBe(5)
  })

  it('is a version bump only', () => {
    expect(migrate(v4)).toEqual({ ...v4, schemaVersion: 5 })
  })

  it('loads and validates through file import and a browser autosave, with no text styling', () => {
    const diagram = parseDiagram(v4)
    expect(DiagramSchema.safeParse(diagram).success).toBe(true)
    expect(diagram.textDefaults).toBeUndefined()
    expect(diagram.nodes.every((n) => n.style.fontFamily === undefined && n.style.fontWeight === undefined)).toBe(true)
    const map = new Map([['chalkline.autosave', JSON.stringify(v4)]])
    const storage = { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), removeItem: (k: string) => void map.delete(k) }
    expect(loadAutosave(storage)).toEqual(diagram)
  })

  it('loads every older version all the way to v5', () => {
    for (const [name, legacy] of Object.entries(legacyFixtures)) {
      const diagram = parseDiagram(legacy)
      expect(diagram.schemaVersion, name).toBe(5)
    }
  })
})

describe('text style fields', () => {
  const styled = () => parseDiagram(fixtures['text-styles'])

  it('the text-styles fixture is saved at v5, validates as is, and round-trips', () => {
    expect(DiagramSchema.safeParse(fixtures['text-styles']).success).toBe(true)
    const d = styled()
    expect(d.textDefaults).toEqual({ fontFamily: 'nunito', fontSize: 16 })
    expect(parseDiagram(JSON.parse(serializeDiagram(d)))).toEqual(d)
  })

  it('keeps a font id this version does not know', () => {
    const d = styled()
    expect(d.nodes.find((n) => n.id === 'n_unknown')?.style.fontFamily).toBe('some-future-font')
    expect(parseDiagram(JSON.parse(serializeDiagram(d))).nodes.find((n) => n.id === 'n_unknown')?.style.fontFamily).toBe('some-future-font')
  })

  it('rejects values outside the allowed sets', () => {
    const base = styled()
    const withNode = (style: Record<string, unknown>) => ({ ...base, nodes: [{ ...base.nodes[0]!, style }] , edges: [] })
    expect(DiagramSchema.safeParse(withNode({ fontWeight: 500 })).success).toBe(false)
    expect(DiagramSchema.safeParse(withNode({ fontStyle: 'oblique' })).success).toBe(false)
    expect(DiagramSchema.safeParse(withNode({ textDecoration: 'overline' })).success).toBe(false)
    expect(DiagramSchema.safeParse(withNode({ textAlign: 'justify' })).success).toBe(false)
    expect(DiagramSchema.safeParse(withNode({ fontFamily: '' })).success).toBe(false)
    expect(DiagramSchema.safeParse({ ...base, textDefaults: { fontSize: 4 } }).success).toBe(false)
  })
})
