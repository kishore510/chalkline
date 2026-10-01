// @vitest-environment happy-dom
import { ReactFlowProvider } from '@xyflow/react'
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { stressDiagram } from '@/fixtures/stress'
import { useDiagramStore } from '@/store/diagramStore'

/*
 * Render counts on the real canvas: selecting or moving one shape must not
 * re-render the others. Each ShapeNode draws one ShapeView, so counting
 * ShapeView renders by label counts shape renders. (React Flow draws no
 * connectors here: it needs measured handles, which happy-dom can't give.
 * perf.test.ts checks connectors at the mapper: unchanged ones keep their
 * objects, so the memoised FloatingEdge skips them.)
 */

const renders = new Map<string, number>()
vi.mock('@/components/shapes/ShapeView', () => ({
  ShapeView: ({ label }: { label: string }) => {
    renders.set(label, (renders.get(label) ?? 0) + 1)
    return null
  },
}))

// The canvas reads sizes from tokens and media queries; give the DOM what it asks for.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const { Canvas } = await import('./Canvas')

let root: Root
let host: HTMLElement
const mount = (node: ReactNode) =>
  act(() => {
    host = document.createElement('div')
    host.style.width = '1200px'
    host.style.height = '800px'
    document.body.append(host)
    root = createRoot(host)
    root.render(node)
  })

const store = () => useDiagramStore.getState()
const labelOf = (id: string) => store().diagram.nodes.find((n) => n.id === id)!.label

beforeEach(async () => {
  renders.clear()
  // A small generated diagram: every shape visible, no groups or hidden layers in the first rows.
  const d = stressDiagram(300)
  store().load({ ...d, groups: [], nodes: d.nodes.slice(0, 40).map(({ groupId: _g, layerId: _l, ...n }) => n), edges: [] }, { undoable: false })
  await mount(
    <ReactFlowProvider>
      <Canvas minimap="none" />
    </ReactFlowProvider>,
  )
})

afterEach(async () => {
  await act(() => root.unmount())
  host.remove()
})

describe('canvas render counts', () => {
  it('renders every shape once to start with', () => {
    expect(renders.size).toBe(40)
  })

  it('selecting one shape re-renders only that shape', async () => {
    renders.clear()
    await act(() => store().setSelection(['n_5']))
    expect([...renders.keys()]).toEqual([labelOf('n_5')])
  })

  it('moving one shape (a drag frame) re-renders only that shape', async () => {
    renders.clear()
    await act(() => store().moveNodes(new Map([['n_7', { x: 900, y: 900 }]])))
    expect([...renders.keys()]).toEqual([labelOf('n_7')])
    renders.clear()
    for (let i = 1; i <= 5; i++) await act(() => store().moveNodes(new Map([['n_7', { x: 900 + i * 4, y: 900 }]])))
    expect([...renders.keys()]).toEqual([labelOf('n_7')])
  })

  it('editing one label re-renders only that shape', async () => {
    renders.clear()
    await act(() => store().setNodeLabel('n_3', 'Renamed'))
    expect([...renders.keys()]).toEqual(['Renamed'])
  })
})
