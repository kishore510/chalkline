import { describe, expect, it } from 'vitest'
import { DiagramSchema } from '@/schema/diagram'
import { STRESS_SIZES, stressDiagram } from './stress'

describe('stress diagrams', () => {
  it.each(STRESS_SIZES)('%i shapes: valid, and the same every time', (count) => {
    const a = stressDiagram(count)
    expect(DiagramSchema.safeParse(a).success).toBe(true)
    expect(a.nodes).toHaveLength(count)
    expect(JSON.stringify(stressDiagram(count))).toBe(JSON.stringify(a))
  })

  it('mixes shapes, fonts, groups, layers (one hidden), locks and a collapsed group', () => {
    const d = stressDiagram(1000)
    expect(new Set(d.nodes.map((n) => n.type)).size).toBeGreaterThan(10)
    expect(new Set(d.nodes.map((n) => n.style.fontFamily)).size).toBeGreaterThan(3)
    expect(d.groups.length).toBeGreaterThan(2)
    expect(d.groups.some((g) => g.collapsed)).toBe(true)
    expect(d.nodes.some((n) => n.layerId === 'l_hidden')).toBe(true)
    expect(d.nodes.some((n) => n.locked)).toBe(true)
    expect(d.edges.length).toBeGreaterThan(800)
  })

  it('a different seed gives a different diagram', () => {
    expect(JSON.stringify(stressDiagram(300, 2))).not.toBe(JSON.stringify(stressDiagram(300)))
  })
})
