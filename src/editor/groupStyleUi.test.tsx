// @vitest-environment happy-dom
import { ReactFlowProvider } from '@xyflow/react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fixtures } from '@/fixtures'
import { DiagramSchema } from '@/schema/diagram'
import { useDiagramStore } from '@/store/diagramStore'
import { PropertiesPanel } from './Properties'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const store = () => useDiagramStore.getState()
const group = (id: string) => store().diagram.groups.find((g) => g.id === id)!
/** A swatch inside the colour field labelled `field` ("Fill" or "Border"). */
const swatch = (field: string, name: string) => {
  const box = [...document.querySelectorAll('[role="group"]')].find((g) => g.querySelector('span')?.textContent === field)
  if (!box) throw new Error(`No ${field} field`)
  const b = box.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`)
  if (!b) throw new Error(`No ${name} swatch in ${field}`)
  return b
}
const button = (label: string) => [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === label)

let unmount: () => void = () => undefined
afterEach(() => {
  unmount()
  document.body.innerHTML = ''
})
beforeEach(() => store().load(fixtures['swimlane-pool'], { undoable: false }))

async function show(selection: string[]) {
  store().setSelection(selection)
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  await act(async () =>
    root.render(
      <ReactFlowProvider>
        <PropertiesPanel />
      </ReactFlowProvider>,
    ),
  )
  unmount = () => act(() => root.unmount())
}

describe('group fill and border in Properties', () => {
  it('sets fill and border on a pool from the presets, and resets them', async () => {
    await show(['g_pool'])
    await act(async () => swatch('Fill', 'Amber').click())
    await act(async () => swatch('Border', 'Amber').click())
    expect(group('g_pool').style).toEqual({ fill: 'token:swatch-amber-soft', stroke: 'token:swatch-amber' })
    await act(async () => button('Reset to default')!.click())
    expect(group('g_pool').style).toEqual({})
    expect(DiagramSchema.safeParse(store().diagram).success).toBe(true)
  })

  it('edits every selected lane at once', async () => {
    await show(['g_lane_channels', 'g_lane_data'])
    expect(document.querySelector('h2')!.textContent).toBe('2 groups')
    await act(async () => swatch('Fill', 'Teal').click())
    expect(group('g_lane_channels').style.fill).toBe('token:swatch-teal-soft')
    expect(group('g_lane_data').style.fill).toBe('token:swatch-teal-soft')
    expect(group('g_lane_integration').style.fill).toBeUndefined()
  })

  it('disables the colours on a locked group', async () => {
    store().setLocked(['g_pool'], true)
    await show(['g_pool'])
    expect(swatch('Fill', 'Teal').disabled).toBe(true)
    expect(swatch('Border', 'Default').disabled).toBe(true)
  })
})
