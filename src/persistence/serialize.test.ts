import { describe, expect, it } from 'vitest'
import { fixtures } from '@/fixtures'
import { parseDiagram } from '@/schema/diagram'
import { fileNameFor, serializeDiagram } from './serialize'

describe('serializeDiagram', () => {
  it.each(Object.keys(fixtures))('round-trips the %s fixture', (name) => {
    const diagram = parseDiagram(fixtures[name])
    expect(parseDiagram(JSON.parse(serializeDiagram(diagram)))).toEqual(diagram)
  })

  it('writes keys in a fixed order regardless of object order', () => {
    const diagram = parseDiagram(fixtures['web-architecture'])
    const shuffled = {
      ...diagram,
      nodes: diagram.nodes.map(({ label, id, style, size, type, notes, position, ...rest }) => ({ style, notes, label, size, position, type, id, ...rest })),
    }
    expect(serializeDiagram(shuffled)).toBe(serializeDiagram(diagram))
    const firstNode = serializeDiagram(diagram).split('\n').find((l) => l.includes('"id":"user"'))!
    expect(firstNode.indexOf('"id"')).toBeLessThan(firstNode.indexOf('"type"'))
    expect(firstNode.indexOf('"type"')).toBeLessThan(firstNode.indexOf('"position"'))
  })

  it('puts each node on its own line so a move is a one-line diff', () => {
    const diagram = parseDiagram(fixtures['all-shapes'])
    const moved = { ...diagram, nodes: diagram.nodes.map((n, i) => (i === 2 ? { ...n, position: { x: 1, y: 2 } } : n)) }
    const a = serializeDiagram(diagram).split('\n')
    const b = serializeDiagram(moved).split('\n')
    expect(a.filter((line, i) => line !== b[i])).toHaveLength(1)
  })

  it('omits unset optional fields', () => {
    const text = serializeDiagram(parseDiagram(fixtures['all-shapes']))
    expect(text).not.toContain('groupId')
    expect(text).not.toContain('undefined')
  })
})

describe('fileNameFor', () => {
  it.each([
    ['Three-tier web app', 'three-tier-web-app.json'],
    ['  Payments / v2!  ', 'payments-v2.json'],
    ['', 'diagram.json'],
    ['???', 'diagram.json'],
  ])('%j -> %s', (title, expected) => {
    expect(fileNameFor(title, 'json')).toBe(expected)
  })
})
