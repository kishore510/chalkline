import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { fixtures, legacyFixtures } from '@/fixtures'
import { searchShapes } from '@/editor/paletteModel'
import { DiagramSchema, migrate } from '@/schema/diagram'
import { getShape, isKnownShape, SHAPE_IDS } from './registry'

/* Shapes pack 3: MCP client, MCP server and agent tools, in AI & ML. */

const PACK = ['mcp-client', 'mcp-server', 'tool']

const found = (query: string) => searchShapes(query).map((s) => s.id)

describe('shapes pack 3', () => {
  it('adds each shape once, in AI & ML', () => {
    expect(new Set(SHAPE_IDS).size).toBe(SHAPE_IDS.length)
    for (const id of PACK) {
      expect(isKnownShape(id), id).toBe(true)
      expect(getShape(id).category, id).toBe('ai')
    }
  })

  it.each(PACK)('%s has an icon, a label, a description and search words', (id) => {
    const shape = getShape(id)
    expect(shape.glyph).toBeDefined()
    expect(renderToStaticMarkup(createElement(shape.icon))).toMatch(/^<svg[^>]*><path d=/)
    expect(shape.defaultLabel.length).toBeGreaterThan(0)
    expect(shape.description.length).toBeGreaterThan(40)
    expect(shape.keywords.length).toBeGreaterThanOrEqual(4)
    expect(found(shape.name)).toContain(id)
    expect(found(shape.defaultLabel)).toContain(id)
  })

  it.each([
    ['mcp', 'mcp-client'],
    ['mcp', 'mcp-server'],
    ['model context protocol', 'mcp-client'],
    ['model context protocol', 'mcp-server'],
    ['agent host', 'mcp-client'],
    ['resources', 'mcp-server'],
    ['plugin', 'tool'],
    ['function calling', 'tool'],
    ['integration', 'tool'],
  ])('search "%s" finds %s', (query, id) => {
    expect(found(query)).toContain(id)
  })

  it('keeps MCP client, MCP server and Microservice apart', () => {
    expect(found('mcp client')).toEqual(['mcp-client'])
    expect(found('mcp server')).toEqual(['mcp-server'])
    expect(found('microservice')).toEqual(['microservice'])
    expect(found('plugin')).toEqual(['tool'])
    // The descriptions the AI chooses from say which side of MCP each is on, and the microservice isn't MCP at all.
    expect(getShape('mcp-client').description).toMatch(/agent host that connects out over the Model Context Protocol/)
    expect(getShape('mcp-server').description).toMatch(/endpoint that exposes tools, resources and prompts/)
    expect(getShape('microservice').description).not.toMatch(/mcp|model context/i)
  })

  it('an old saved diagram still loads', () => {
    for (const raw of [...Object.values(fixtures), ...Object.values(legacyFixtures)]) {
      expect(DiagramSchema.safeParse(migrate(raw)).success).toBe(true)
    }
  })
})
