import { describe, expect, it } from 'vitest'
import { stressDiagram } from '@/fixtures/stress'
import { useDiagramStore } from '@/store/diagramStore'
import { isNodeLocked } from '@/store/groups'
import { layerIdOf, layerIndex } from '@/store/layers'
import { createEdgeMapper, createNodeMapper, zForEdge, zForNode } from './flow'
import { guideTargets, nearView, snapDrag } from './guideTargets'
import { buildRenderModel } from './renderModel'
import { createRouteCache } from './routing'
import { spreadAttachments } from './spread'

/*
 * Performance sanity check on the generated 1000-shape diagram: the cost of
 * the first draw (every route) and of one drag frame, as the canvas computes
 * them. Bounds are generous so slow machines don't fail; the log shows the
 * real numbers.
 */

/** One drag frame, as the canvas does it: store update, then everything derived for drawing. */
function frameRunner() {
  const mapNodes = createNodeMapper()
  const mapEdges = createEdgeMapper()
  const route = createRouteCache()
  let spread: ReturnType<typeof spreadAttachments> | undefined
  const timings: Record<string, number> = {}
  const time = <T,>(name: string, f: () => T): T => {
    const t = performance.now()
    const out = f()
    timings[name] = (timings[name] ?? 0) + performance.now() - t
    return out
  }
  let lastEdges: ReturnType<typeof mapEdges> = []
  let changedEdges = 0
  const draw = () => {
    const d = useDiagramStore.getState().diagram
    const selected = new Set(useDiagramStore.getState().selection)
    const model = time('renderModel', () => buildRenderModel(d))
    time('nodes', () => {
      const visible = d.nodes.filter((n) => !model.hiddenNodes.has(n.id))
      const locked = new Set(visible.filter((n) => isNodeLocked(d, n)).map((n) => n.id))
      return mapNodes(visible, selected, true, locked, (n) => zForNode(layerIndex(d, layerIdOf(n))))
    })
    const routes = time('routes', () => route({ nodes: model.routingNodes, edges: model.edges }))
    time('spread', () => (spread = spreadAttachments(model.routingNodes, model.edges, routes, spread)))
    const edges = time('edges', () => mapEdges(model.edges, selected, routes, 1.5, spread, (e) => zForEdge(layerIndex(d, layerIdOf(e)))))
    const before = new Set(lastEdges)
    changedEdges = edges.filter((e) => !before.has(e)).length
    lastEdges = edges
    return model
  }
  return { draw, time, timings, changed: () => changedEdges }
}

describe('drag frame cost (1000 shapes)', () => {
  it('reports the cost per frame', { timeout: 60_000 }, () => {
    useDiagramStore.getState().load(stressDiagram(1000), { undoable: false })
    const { draw, time, timings, changed } = frameRunner()
    const first = performance.now()
    const model = draw()
    const firstMs = performance.now() - first
    console.log(`first draw (all routes), 1000 shapes: ${firstMs.toFixed(0)} ms`, { ...timings })
    // Was about 4,900 ms before routing used padded-box caches and a bounding-box pre-check (Raspberry Pi 5).
    expect(firstMs).toBeLessThan(2000)
    for (const k of Object.keys(timings)) delete timings[k]
    const id = 'n_500'
    const start = useDiagramStore.getState().diagram.nodes.find((n) => n.id === id)!.position
    const targets = guideTargets(useDiagramStore.getState().diagram, model, [id])
    const frames = 60
    const t0 = performance.now()
    useDiagramStore.getState().beginBatch()
    for (let i = 1; i <= frames; i++) {
      const to = { x: start.x + i * 3, y: start.y + i }
      const d = useDiagramStore.getState().diagram
      const snapped = time('snap', () => snapDrag(d, model, new Map([[id, to]]), nearView(targets, { x: start.x - 600, y: start.y - 400, width: 1200, height: 800 }, 200), { zoom: 1, guides: true, grid: 0 }))
      time('store', () => useDiagramStore.getState().moveNodes(snapped.moves))
      draw()
      // Only connectors touching the dragged shape (or ones it now crosses) get new objects; React Flow skips the rest.
      expect(changed()).toBeLessThan(20)
    }
    useDiagramStore.getState().endBatch()
    const perFrame = (performance.now() - t0) / frames
    const report = Object.fromEntries(Object.entries(timings).map(([k, v]) => [k, Math.round((v / frames) * 100) / 100]))
    console.log(`drag frame, 1000 shapes: ${perFrame.toFixed(2)} ms/frame`, report)
    // Was about 19 ms before hidden-connector checks stopped searching every node (Raspberry Pi 5); now about 6.
    expect(perFrame).toBeLessThan(30)
  })
})

describe('bulk actions on 1000 shapes', () => {
  it('search, align and distribute stay quick; auto-arrange finishes', { timeout: 120_000 }, async () => {
    const { searchDiagram } = await import('@/search/search')
    const { computeLayout } = await import('@/layout/computeLayout')
    const { default: ELK } = await import('elkjs/lib/elk.bundled.js')
    useDiagramStore.getState().load(stressDiagram(1000), { undoable: false })
    const d = useDiagramStore.getState().diagram
    const time = async (f: () => unknown) => {
      const t = performance.now()
      await f()
      return performance.now() - t
    }
    const search = await time(() => searchDiagram(d, 'orders'))
    useDiagramStore.getState().setSelection(d.nodes.slice(0, 1000).map((n) => n.id))
    const align = await time(() => useDiagramStore.getState().alignSelection('left'))
    useDiagramStore.getState().undo()
    const distribute = await time(() => useDiagramStore.getState().distributeSelection('horizontal'))
    useDiagramStore.getState().undo()
    const arrange = await time(() => computeLayout(d, { direction: 'right', spacing: 'normal' }, new ELK()))
    console.log('1000 shapes, ms:', { search: Math.round(search), align: Math.round(align), distribute: Math.round(distribute), autoArrange: Math.round(arrange) })
    expect(search).toBeLessThan(200)
    expect(align).toBeLessThan(1000)
    expect(distribute).toBeLessThan(1000)
  })
})
