import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { fixtures, legacyFixtures } from '@/fixtures'
import { searchShapes } from '@/editor/paletteModel'
import { DiagramSchema, migrate } from '@/schema/diagram'
import { CATEGORIES, getShape, isKnownShape, SHAPE_IDS, SHAPES } from './registry'

/* Shapes pack 2: networking, more architecture, and AI & ML. */

const PACK: Record<string, string[]> = {
  networking: ['firewall', 'router', 'load-balancer', 'api-gateway', 'cdn'],
  architecture: ['cache', 'message-bus', 'microservice', 'object-storage', 'worker'],
  ai: ['ai-gateway', 'ai-guardrails', 'llm', 'vector-db', 'embeddings', 'semantic-cache', 'ai-agent', 'agent-identity', 'prompt-template'],
}

describe('shapes pack 2', () => {
  it('adds every shape once, in its category', () => {
    expect(new Set(SHAPE_IDS).size).toBe(SHAPE_IDS.length)
    expect(new Set(SHAPES.map((s) => s.name.toLowerCase())).size).toBe(SHAPES.length)
    for (const [category, ids] of Object.entries(PACK)) for (const id of ids) expect(getShape(id).category, id).toBe(category)
    expect(SHAPES).toHaveLength(16 + 19)
  })

  it('has the Networking and AI & ML categories', () => {
    expect(CATEGORIES.map((c) => c.name)).toEqual(['Basic', 'Process', 'Architecture', 'Networking', 'AI & ML', 'Annotation'])
  })

  it.each(Object.values(PACK).flat())('%s has an icon, sane sizes and search words', (id) => {
    const shape = getShape(id)
    expect(isKnownShape(id)).toBe(true)
    expect(renderToStaticMarkup(createElement(shape.icon))).toMatch(/^<svg[^>]*lucide/)
    const { width, height } = shape.defaultSize
    expect(width).toBeGreaterThanOrEqual(100)
    expect(width).toBeLessThanOrEqual(240)
    expect(height).toBeGreaterThanOrEqual(60)
    expect(height).toBeLessThanOrEqual(160)
    expect(shape.description?.length).toBeGreaterThan(0)
    expect(shape.keywords?.length).toBeGreaterThan(0)
    expect(searchShapes(shape.name).map((s) => s.id)).toContain(id)
  })

  it.each([
    ['pub-sub', 'message-bus'],
    ['redis', 'cache'],
    ['llm', 'llm'],
    ['rag', 'vector-db'],
    ['cron', 'worker'],
    ['data lake', 'object-storage'],
    ['edge', 'cdn'],
    ['switch', 'router'],
    ['orchestrator', 'ai-agent'],
    ['prompt', 'prompt-template'],
  ])('search "%s" finds %s', (query, id) => {
    expect(searchShapes(query).map((s) => s.id)).toContain(id)
  })

  it('keeps similar shapes apart in search', () => {
    expect(searchShapes('semantic').map((s) => s.id)).toEqual(['semantic-cache'])
    expect(searchShapes('ai gateway').map((s) => s.id)).toEqual(['ai-gateway'])
    expect(searchShapes('pub-sub').map((s) => s.id)).not.toContain('queue')
  })

  it('an old saved diagram still loads', () => {
    for (const raw of [...Object.values(fixtures), ...Object.values(legacyFixtures)]) {
      expect(DiagramSchema.safeParse(migrate(raw)).success).toBe(true)
    }
  })
})
