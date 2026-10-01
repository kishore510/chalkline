// @vitest-environment happy-dom
import { ReactFlowProvider } from '@xyflow/react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createEmptyDiagram, type Diagram } from '@/schema/diagram'
import { createNode } from '@/schema/factories'
import { useDiagramStore } from '@/store/diagramStore'
import { useUiStore } from '@/store/uiStore'

/* Keyboard use of the real canvas: Tab through shapes in reading order, Enter and Space, no trap. */

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver
globalThis.CSS ??= { escape: (s: string) => s } as typeof CSS
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const { Canvas } = await import('./Canvas')
const { useCanvasKeyboard } = await import('./useCanvasKeyboard')

function Harness() {
  useCanvasKeyboard()
  return <Canvas minimap="none" />
}

let root: Root
let host: HTMLElement
const store = () => useDiagramStore.getState()

// Stored out of reading order on purpose.
function diagram(): Diagram {
  const at = (id: string, x: number, y: number, extra = {}) => createNode('rectangle', { x, y }, { id, label: id.toUpperCase(), ...extra })
  return {
    ...createEmptyDiagram(),
    layers: [
      { id: 'default', name: 'Base', visible: true, locked: false },
      { id: 'l_off', name: 'Off', visible: false, locked: false },
    ],
    nodes: [at('c', 0, 300), at('b', 400, 0), at('a', 0, 0), at('hidden', 200, 150, { layerId: 'l_off' })],
    edges: [{ id: 'e1', source: 'a', target: 'b', label: 'calls', notes: '', style: {} }],
  }
}

const active = () => (document.activeElement as HTMLElement | null)?.closest('[data-id]')?.getAttribute('data-id') ?? (document.activeElement?.classList.contains('react-flow') ? 'canvas' : 'elsewhere')
function press(key: string, init: KeyboardEventInit = {}) {
  const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
  ;(document.activeElement ?? document.body).dispatchEvent(e)
  return e
}

beforeEach(async () => {
  store().load(diagram(), { undoable: false })
  useUiStore.getState().setTool('select')
  host = document.createElement('div')
  document.body.append(host)
  await act(() => {
    root = createRoot(host)
    root.render(
      <ReactFlowProvider>
        <Harness />
      </ReactFlowProvider>,
    )
  })
  host.querySelector<HTMLElement>('.react-flow')!.focus()
})

afterEach(async () => {
  await act(() => root.unmount())
  host.remove()
})

describe('canvas keyboard', () => {
  it('the canvas is one Tab stop; shapes and connectors are out of the page Tab order but named', () => {
    expect(active()).toBe('canvas')
    const nodes = [...host.querySelectorAll<HTMLElement>('.react-flow__node')]
    expect(nodes.length).toBeGreaterThan(0)
    for (const n of nodes) expect(n.tabIndex).toBe(-1)
    expect(host.querySelector('.react-flow__node[data-id="a"]')?.getAttribute('aria-label')).toBe('A, rectangle')
  })

  it('Tab walks shapes in reading order, skipping hidden ones, then lets focus leave', () => {
    const seen: string[] = []
    for (let i = 0; i < 3; i++) {
      expect(press('Tab').defaultPrevented).toBe(true)
      seen.push(active())
    }
    expect(seen).toEqual(['a', 'b', 'c'])
    // Connectors come last; in this DOM they may not be drawn (no measured handles), so focus may stay.
    const past = press('Tab')
    if (!past.defaultPrevented) expect(active()).toBe('c')
  })

  it('Shift+Tab from the first shape lets focus go back out of the canvas', () => {
    press('Tab')
    expect(active()).toBe('a')
    expect(press('Tab', { shiftKey: true }).defaultPrevented).toBe(false)
  })

  it('Enter selects, Enter again edits the label; Space toggles; Shift+F10 opens the menu', async () => {
    press('Tab')
    await act(() => void press('Enter'))
    expect(store().selection).toEqual(['a'])
    await act(() => void press('Enter'))
    expect(useUiStore.getState().editingId).toBe('a')
    await act(() => useUiStore.getState().setEditing(null))
    host.querySelector<HTMLElement>('.react-flow__node[data-id="a"]')!.focus()
    press('Tab')
    await act(() => void press(' '))
    expect(store().selection).toEqual(['a', 'b'])
    await act(() => void press(' '))
    expect(store().selection).toEqual(['a'])
    await act(() => void press('F10', { shiftKey: true }))
    expect(useUiStore.getState().contextMenu).toMatchObject({ id: 'b', kind: 'node' })
    // Keyboard selection is not an undo step.
    expect(store().past).toHaveLength(0)
  })
})
