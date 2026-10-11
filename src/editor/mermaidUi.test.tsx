// @vitest-environment happy-dom
import { ReactFlowProvider } from '@xyflow/react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { exportFixtures } from '@/fixtures'
import { parseDiagram } from '@/schema/diagram'
import { useDiagramStore } from '@/store/diagramStore'
import { FileMenu } from './FileMenu'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const sample = parseDiagram(exportFixtures['mermaid-sample'])
const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]')
const preview = () => dialog()!.querySelector<HTMLTextAreaElement>('textarea')!
const button = (label: string) => [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === label || b.getAttribute('aria-label') === label)
const click = async (label: string) => {
  const b = button(label)
  if (!b) throw new Error(`No button "${label}"`)
  await act(async () => b.click())
}
// The export module loads on first use: let its import and the state update settle.
const settle = () => act(async () => vi.dynamicImportSettled())

let unmount: () => void = () => undefined
afterEach(() => {
  unmount()
  document.body.innerHTML = ''
})

async function openMermaid() {
  useDiagramStore.setState({ diagram: sample })
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  await act(async () =>
    root.render(
      <ReactFlowProvider>
        <FileMenu layout="desktop" />
      </ReactFlowProvider>,
    ),
  )
  unmount = () => act(() => root.unmount())
  await click('File menu')
  await click('Mermaid (.mmd)…')
  await settle()
}

describe('Mermaid export sheet', () => {
  it('shows the preview and what is not included, and changes with the options', async () => {
    await openMermaid()
    expect(dialog()?.getAttribute('aria-labelledby')).toBeTruthy()
    expect(preview().readOnly).toBe(true)
    expect(preview().value.startsWith('flowchart LR\n')).toBe(true)
    expect(dialog()!.textContent).toContain('What is not included')
    expect(dialog()!.textContent).toContain('Hidden layers are left out')

    await click('Top-down')
    await settle()
    expect(preview().value.startsWith('flowchart TD\n')).toBe(true)

    expect(preview().value).not.toContain('%% note')
    await act(async () => dialog()!.querySelector<HTMLButtonElement>('[role="switch"]')!.click())
    await settle()
    expect(preview().value).toContain('%% note for n2:')
  })

  it('copies, and falls back to selecting the text when the clipboard fails', async () => {
    const writeText = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('blocked'))
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    await openMermaid()

    await click('Copy to clipboard')
    expect(writeText).toHaveBeenCalledWith(preview().value)
    expect(dialog()!.querySelector('[role="status"]')?.textContent).toBe('Copied to clipboard.')

    await click('Copy to clipboard')
    expect(dialog()!.querySelector('[role="status"]')?.textContent).toMatch(/Couldn’t copy/)
    expect(document.activeElement).toBe(preview())
  })

  it('never changes the diagram, and focus returns to the menu button on close', async () => {
    await openMermaid()
    const before = useDiagramStore.getState().diagram
    await click('Left-right')
    await settle()
    expect(useDiagramStore.getState().diagram).toBe(before)

    vi.useFakeTimers()
    await click('Close')
    await act(async () => vi.runAllTimers())
    vi.useRealTimers()
    expect(dialog()).toBeNull()
    expect(document.activeElement).toBe(button('File menu'))
  })
})
