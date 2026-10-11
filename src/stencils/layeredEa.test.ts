import { beforeEach, describe, expect, it } from 'vitest'
import { LAYER_PRESETS, presetToken } from '@/lib/colour'
import { DiagramSchema, type Diagram } from '@/schema/diagram'
import { getShape, isKnownShape } from '@/shapes/registry'
import { useDiagramStore } from '@/store/diagramStore'
import { laneOrder } from '@/store/groups'
import { BUILTIN_STENCILS, builtinStencilFiles, TEMPLATES } from './builtin'
import { parseStencil } from './format'
import { createLibrary } from './library'
import { memoryRepository } from './repository'
import { diagramFromTemplate } from './templates'
import { stencilThumbnail } from './thumbnail'
import { testThumbnailEnv } from './testEnv'

/*
 * The Layered EA pack: per-layer stencils, cross-layer examples and a
 * five-band template, all coloured with the layer presets.
 */

const PREFIX = 'Layered EA: '
const LAYERS = Object.keys(LAYER_PRESETS) as (keyof typeof LAYER_PRESETS)[]
const SOFT = new Set(LAYERS.map((l) => presetToken(LAYER_PRESETS[l], 'soft')))
const STRONG = new Set(LAYERS.map((l) => presetToken(LAYER_PRESETS[l], 'strong')))

const pack = Object.entries(builtinStencilFiles).filter(([id]) => id.startsWith('layered-ea-'))
const template = TEMPLATES.find((t) => t.id === 'template:layered-ea')!
const store = () => useDiagramStore.getState()
const issues = (d: Diagram) => DiagramSchema.safeParse(d).error?.issues ?? []

describe('Layered EA stencils', () => {
  it('has twelve stencils, in eight categories', () => {
    expect(pack).toHaveLength(12)
    const categories = new Set(pack.map(([, raw]) => parseStencil(raw).category))
    expect([...categories].sort()).toEqual(
      ['AI layer', 'Application', 'Business', 'Cross-layer', 'Data', 'Network', 'Other', 'Technology'].map((c) => PREFIX + c),
    )
  })

  it.each(pack)('%s has the prefix, the layered-ea tag plus one more, and only real shapes', (id, raw) => {
    const s = parseStencil(raw)
    expect(s.id).toBe(`builtin:${id}`)
    expect(s.category.startsWith(PREFIX)).toBe(true)
    expect(s.tags[0]).toBe('layered-ea')
    expect(s.tags).toHaveLength(2)
    for (const n of s.content.nodes) expect(isKnownShape(n.type), n.type).toBe(true)
  })

  it.each(pack)('%s colours every shape with a layer preset, and its groups too', (_id, raw) => {
    const s = parseStencil(raw)
    for (const n of s.content.nodes) {
      expect(SOFT.has(n.style.fill ?? ''), `${n.label} fill`).toBe(true)
      expect(STRONG.has(n.style.stroke ?? ''), `${n.label} border`).toBe(true)
      // Shapes with their own default style would fight the preset fill.
      expect(getShape(n.type).defaultStyle, n.type).toEqual({})
    }
    for (const g of s.content.groups) expect(SOFT.has(g.style.fill ?? ''), `${g.label} fill`).toBe(true)
  })

  it.each(pack)('%s keeps only plain connectors with the existing arrowheads', (_id, raw) => {
    for (const e of parseStencil(raw).content.edges) {
      expect(Object.keys(e.style).every((k) => ['dashed', 'endArrow'].includes(k)), e.id).toBe(true)
      expect([undefined, 'arrow', 'closed']).toContain(e.style.endArrow)
    }
  })

  it('a stencil inserted into the diagram is one undo step and leaves valid state', () => {
    store().load({ ...store().diagram, nodes: [], edges: [], groups: [] }, { undoable: false })
    for (const [, raw] of pack) {
      const depth = store().past.length
      const ids = store().insertStencil(parseStencil(raw).content, { x: 0, y: 0 }, 20)
      expect(ids?.length).toBeGreaterThan(0)
      expect(store().past).toHaveLength(depth + 1)
      expect(issues(store().diagram)).toEqual([])
    }
  })

  it('every one can be duplicated to my library as an editable copy', async () => {
    let n = 0
    const lib = createLibrary({
      repository: memoryRepository(),
      thumbnail: (c) => stencilThumbnail(c, testThumbnailEnv),
      now: () => new Date('2026-10-11T12:00:00.000Z'),
      makeId: () => `s_${++n}`,
    })
    for (const s of BUILTIN_STENCILS.filter((b) => b.tags.includes('layered-ea'))) {
      const copy = await lib.duplicate(s)
      expect(copy.id.startsWith('builtin:')).toBe(false)
      expect(copy.stencil.category).toBe(s.category)
      expect(copy.stencil.content).toEqual(s.content)
    }
    expect(lib.all()).toHaveLength(12)
  })
})

describe('Layered EA template', () => {
  it('is in the Layered EA category with the layered-ea tag', () => {
    expect(template.category.startsWith(PREFIX)).toBe(true)
    expect(template.tags).toContain('layered-ea')
  })

  it('has five horizontal bands in order, each filled with its layer preset', () => {
    const pool = template.diagram.groups.find((g) => g.kind === 'container' && !g.parentId)!
    const lanes = laneOrder(template.diagram, pool.id)
    expect(lanes.map((l) => l.label)).toEqual(['Business', 'Data', 'Application', 'Technology', 'Network'])
    for (const lane of lanes) {
      const preset = LAYER_PRESETS[lane.label.toLowerCase() as keyof typeof LAYER_PRESETS]
      expect(lane.orientation).toBe('horizontal')
      expect(lane.style).toEqual({ fill: presetToken(preset, 'soft'), stroke: presetToken(preset, 'strong') })
      expect(template.diagram.nodes.filter((n) => n.groupId === lane.id).length, lane.label).toBeGreaterThanOrEqual(3)
    }
  })

  it('mixes general, infrastructure and AI shapes, all real, with connectors', () => {
    const shapes = template.diagram.nodes.map((n) => getShape(n.type))
    expect(template.diagram.nodes.every((n) => isKnownShape(n.type))).toBe(true)
    const categories = new Set(shapes.map((s) => s.category))
    for (const c of ['basic', 'architecture', 'networking', 'ai']) expect(categories.has(c as never), c).toBe(true)
    expect(template.diagram.edges.length).toBeGreaterThanOrEqual(10)
    expect(template.diagram.edges.some((e) => e.style.dashed)).toBe(true)
  })

  describe('in the store', () => {
    beforeEach(() => store().load(diagramFromTemplate(template, new Date('2026-10-11T09:00:00.000Z')), { undoable: false }))

    it('loads as valid state', () => {
      expect(issues(store().diagram)).toEqual([])
      expect(store().diagram.groups.filter((g) => g.kind === 'lane')).toHaveLength(5)
    })

    it('recolours a band in one undo step, and a locked band refuses', () => {
      const lane = store().diagram.groups.find((g) => g.label === 'Network')!
      store().updateGroupStyles([lane.id], { fill: presetToken('slate', 'soft') })
      expect(store().past).toHaveLength(1)
      store().undo()
      expect(store().diagram.groups.find((g) => g.id === lane.id)!.style.fill).toBe(presetToken('steel', 'soft'))
      store().setLocked([lane.id], true)
      const before = store().diagram
      store().updateGroupStyles([lane.id], { fill: undefined })
      expect(store().diagram).toBe(before)
    })
  })
})
