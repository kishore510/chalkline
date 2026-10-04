// @vitest-environment happy-dom
import { ReactFlowProvider } from '@xyflow/react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fixtures } from '@/fixtures'
import { parseDiagram } from '@/schema/diagram'
import { updateSettings } from '@/settings/settingsStore'
import { useSettingsSheet } from '@/settings/SettingsEntry'
import { useDiagramStore } from '@/store/diagramStore'
import { useRefineLog } from './refineNarrative'
import { AI_BUTTON_LABEL, AiButton, GenerateSheetHost, useGenerateSheet } from './GenerateEntry'
import { forgetKey, saveKey } from './keyStore'
import { AI_MODELS } from './models'
import { NOTICE_TITLE } from './ConfirmSend'
import { resetSecretsForTests } from './redact'
import { useUsageStore } from './usage'

vi.mock('@/layout/elkWorker', async () => {
  const { default: ELK } = await import('elkjs/lib/elk.bundled.js')
  const elk = new ELK()
  return { getElk: async () => elk }
})

const FAKE = 'sk-ant-api03-FAKE_generate_ui_0123456789abcdef-Ui77'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const ANSWER = {
  nodes: [
    { id: 'gw', label: 'AI gateway', shape: 'ai-gateway' },
    { id: 'client', label: 'MCP client', shape: 'mcp-client' },
    { id: 'server', label: 'MCP server', shape: 'mcp-server' },
    { id: 'odd', label: 'Flux capacitor', shape: 'flux-capacitor' },
  ],
  edges: [
    { from: 'gw', to: 'client' },
    { from: 'client', to: 'server', direction: 'both' },
  ],
}

function respondWith(answer: unknown, delay?: Promise<void>) {
  const calls: RequestInit[] = []
  globalThis.fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    calls.push(init ?? {})
    if (delay) await delay
    if (init?.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const text = typeof answer === 'string' ? answer : JSON.stringify(answer)
    return new Response(JSON.stringify({ content: [{ type: 'text', text }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } }), { status: 200 })
  }) as unknown as typeof fetch
  return calls
}

async function mount() {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  await act(async () =>
    root.render(
      <ReactFlowProvider>
        <AiButton />
        <GenerateSheetHost />
      </ReactFlowProvider>,
    ),
  )
  return { unmount: () => act(() => root.unmount()) }
}

const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]')
const button = (text: string) => [...document.querySelectorAll<HTMLButtonElement>('button:not([data-mode])')].find((b) => b.textContent?.trim() === text)
const click = async (text: string) => {
  const b = button(text)
  if (!b) throw new Error(`No button "${text}" in: ${dialog()?.textContent}`)
  await act(async () => b.click())
}
async function type(value: string) {
  const area = document.querySelector('textarea')!
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(area, value)
  await act(async () => area.dispatchEvent(new Event('input', { bubbles: true })))
}
/** Lets the lazy sheet, dynamic imports and the request settle. */
async function settle(times = 30) {
  for (let i = 0; i < times; i++) await act(async () => new Promise((r) => setTimeout(r, 5)))
}
/** Waits (up to a few seconds, for a busy machine) until the sheet shows `text`. */
async function until(text: string) {
  for (let i = 0; i < 600 && !dialog()?.textContent?.includes(text); i++) await settle(1)
}
async function open() {
  await act(async () => document.querySelector<HTMLButtonElement>(`button[aria-label="${AI_BUTTON_LABEL}"]`)!.click())
  // The sheet loads on first open.
  for (let i = 0; i < 400 && !dialog(); i++) await settle(1)
  await settle(2)
}

beforeEach(() => {
  useDiagramStore.getState().load(parseDiagram(fixtures['web-architecture']), { undoable: false })
  updateSettings({ ai: { noticeAcknowledged: false } })
  useUsageStore.getState().reset()
  useRefineLog.getState().reset()
})
afterEach(async () => {
  useGenerateSheet.getState().closeGenerate()
  useSettingsSheet.getState().closeSettings()
  forgetKey()
  resetSecretsForTests()
  document.body.innerHTML = ''
})

describe('Generate diagram sheet', () => {
  it('with no key: explains, and links to Settings > AI', async () => {
    const { unmount } = await mount()
    await open()
    expect(dialog()?.textContent).toContain('Add your API key first')
    expect(document.querySelector('textarea')).toBeNull()
    await click('Open Settings, AI')
    expect(useGenerateSheet.getState().open).toBe(false)
    expect(useSettingsSheet.getState()).toMatchObject({ open: true, section: 'ai' })
    await unmount()
  })

  it('describe -> check (notice, model, what is sent) -> preview with warnings -> Add: one undo step', async () => {
    saveKey(FAKE, 'session')
    const calls = respondWith(ANSWER)
    const { unmount } = await mount()
    await open()
    const text = dialog()!.textContent!
    expect(text).toContain(AI_MODELS.large.name)
    expect(text).toContain('Only this text is sent, not your diagram.')
    expect(button('Generate')!.disabled).toBe(true)

    // Example chips only fill in the description.
    await click('AI agent with MCP')
    expect(document.querySelector('textarea')!.value).toContain('MCP server')
    expect(calls).toHaveLength(0)
    await type('An AI gateway, an MCP client and an MCP server.')
    expect(dialog()!.textContent).toContain('47 of 2,000 characters')

    await click('Generate')
    expect(dialog()!.textContent).toContain('Check before sending')
    expect(dialog()!.textContent).toContain(NOTICE_TITLE)
    expect(dialog()!.textContent).toContain(AI_MODELS.large.id)
    expect(dialog()!.textContent).toContain('Nothing from your current diagram')
    expect(calls).toHaveLength(0)

    await click('Send')
    await until('Add to canvas')
    expect(calls).toHaveLength(1)
    expect(dialog()!.textContent).toContain('4 shapes, 2 connectors')
    expect(dialog()!.textContent).toContain('What was changed')
    expect(dialog()!.textContent).toContain('“Flux capacitor” asked for an unknown shape')
    expect(dialog()!.querySelector('svg')).not.toBeNull()
    expect(dialog()!.innerHTML).not.toContain(FAKE)
    // The usage line: the model and the counts the API sent back.
    expect(dialog()!.textContent).toContain('Last request: Claude Sonnet 5.5: 1 input token, 1 output token.')
    expect(dialog()!.textContent).toContain('This visit: 1 request')

    // Nothing on the canvas yet.
    const before = useDiagramStore.getState().diagram
    expect(useDiagramStore.getState().past).toHaveLength(0)

    await click('Add to canvas')
    const after = useDiagramStore.getState()
    expect(after.diagram.nodes).toHaveLength(before.nodes.length + 4)
    expect(after.past).toHaveLength(1)
    expect(after.selection).toHaveLength(4 + 2)
    expect(useGenerateSheet.getState().open).toBe(false)
    // Recorded in the AI change log, without opening it.
    const log = useRefineLog.getState()
    expect(log.open).toBe(false)
    expect(log.entries).toHaveLength(1)
    expect(log.entries[0]).toMatchObject({ feature: 'generate', instruction: 'An AI gateway, an MCP client and an MCP server.', summary: 'Generated a new diagram: 4 shapes, 2 connectors.' })
    expect(log.entries[0]!.items[0]).toMatchObject({ kind: 'added', text: 'Added 4 shapes, 2 connectors' })
    expect(log.entries[0]!.items[0]!.ids).toHaveLength(6)
    expect(log.entries[0]!.items).toHaveLength(5)
    expect(log.entries[0]!.historySize).toBe(1)
    after.undo()
    expect(useDiagramStore.getState().diagram.nodes).toEqual(before.nodes)
    await unmount()
  })

  it('Cancel while generating stops the request and goes back to the description', async () => {
    saveKey(FAKE, 'session')
    updateSettings({ ai: { noticeAcknowledged: true } })
    let release = () => {}
    respondWith(ANSWER, new Promise<void>((r) => (release = r)))
    const { unmount } = await mount()
    await open()
    await type('Something')
    await click('Generate')
    expect(dialog()!.textContent).not.toContain(NOTICE_TITLE)
    await click('Send')
    await until('Asking')
    expect(dialog()!.textContent).toContain('Asking')
    await click('Cancel')
    release()
    for (let i = 0; i < 600 && !document.querySelector('textarea'); i++) await settle(1)
    expect(document.querySelector('textarea')!.value).toBe('Something')
    expect(dialog()!.textContent).not.toContain('Add to canvas')
    expect(useDiagramStore.getState().past).toHaveLength(0)
    await unmount()
  })

  it('a malformed answer: a friendly problem with Retry, which goes through the check again', async () => {
    saveKey(FAKE, 'session')
    updateSettings({ ai: { noticeAcknowledged: true } })
    const calls = respondWith('I would love to help! First, tell me more.')
    const { unmount } = await mount()
    await open()
    await type('A queue')
    await click('Generate')
    await click('Send')
    await until('Retry')
    expect(dialog()!.textContent).toContain('The answer couldn’t be turned into a diagram')
    expect(calls).toHaveLength(1)
    await click('Retry')
    expect(dialog()!.textContent).toContain('Check before sending')
    expect(calls).toHaveLength(1)
    await unmount()
  })
})
