// @vitest-environment happy-dom
import { ReactFlowProvider } from '@xyflow/react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAnnounceStore } from '@/a11y/announce'
import { fixtures } from '@/fixtures'
import { parseDiagram, type Diagram } from '@/schema/diagram'
import { updateSettings } from '@/settings/settingsStore'
import { useDiagramStore } from '@/store/diagramStore'
import { NOTICE_TITLE } from './ConfirmSend'
import { AI_BUTTON_LABEL, AiButton, GenerateSheetHost, openSummarise, useAiSheet } from './GenerateEntry'
import { forgetKey, saveKey } from './keyStore'
import { AI_MODELS } from './models'
import { resetSecretsForTests } from './redact'
import { useUsageStore } from './usage'

vi.mock('@/layout/elkWorker', async () => {
  const { default: ELK } = await import('elkjs/lib/elk.bundled.js')
  const elk = new ELK()
  return { getElk: async () => elk }
})

const FAKE = 'sk-ant-api03-FAKE_summarise_ui_0123456789abcdef-Su11'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const ANSWER = '## Overview\nA web shop. <img src="https://evil.example/x.png"> See [docs](https://evil.example).\n\n- **Load balancer** in front of the app servers.'

function respondWith(text: string, { delay, usage = { input_tokens: 1234, output_tokens: 56 } }: { delay?: Promise<void>; usage?: unknown } = {}) {
  const calls: RequestInit[] = []
  globalThis.fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    calls.push(init ?? {})
    if (delay) await delay
    if (init?.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    return new Response(JSON.stringify({ content: [{ type: 'text', text }], stop_reason: 'end_turn', ...(usage !== undefined && { usage }) }), { status: 200 })
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
const text = () => dialog()?.textContent ?? ''
const button = (label: string) => [...document.querySelectorAll<HTMLButtonElement>('button:not([data-mode])')].find((b) => b.textContent?.trim() === label)
const click = async (label: string) => {
  const b = button(label)
  if (!b) throw new Error(`No button "${label}" in: ${text()}`)
  await act(async () => b.click())
}
const choose = async (label: string) => {
  const input = [...document.querySelectorAll<HTMLLabelElement>('label')].find((l) => l.textContent?.startsWith(label))?.querySelector('input')
  if (!input) throw new Error(`No choice "${label}"`)
  await act(async () => input.click())
}
const toggle = async (label: string) => {
  const sw = [...document.querySelectorAll<HTMLLabelElement>('label')].find((l) => l.textContent?.trim() === label)?.querySelector<HTMLButtonElement>('[role="switch"]')
  if (!sw) throw new Error(`No switch "${label}"`)
  await act(async () => sw.click())
}
async function settle(times = 30) {
  for (let i = 0; i < times; i++) await act(async () => new Promise((r) => setTimeout(r, 5)))
}
async function until(what: string) {
  for (let i = 0; i < 600 && !text().includes(what); i++) await settle(1)
}
async function open() {
  await act(async () => openSummarise())
  for (let i = 0; i < 400 && !dialog(); i++) await settle(1)
  await settle(2)
}
const sentPrompt = (call: RequestInit) => (JSON.parse(String(call.body)) as { messages: { content: string }[] }).messages[0]!.content
const announced = () => useAnnounceStore.getState().message?.text ?? ''

let web: Diagram
beforeEach(() => {
  web = parseDiagram(fixtures['web-architecture'])
  useDiagramStore.getState().load(web, { undoable: false })
  updateSettings({ ai: { noticeAcknowledged: false } })
  useUsageStore.getState().reset()
})
afterEach(async () => {
  useAiSheet.getState().closeGenerate()
  useAiSheet.getState().setMode('generate')
  forgetKey()
  resetSecretsForTests()
  document.body.innerHTML = ''
})

describe('Summarise sheet', () => {
  it('the AI button opens the sheet; Generate and Summarise switch in place', async () => {
    saveKey(FAKE, 'session')
    const { unmount } = await mount()
    await act(async () => document.querySelector<HTMLButtonElement>(`button[aria-label="${AI_BUTTON_LABEL}"]`)!.click())
    for (let i = 0; i < 400 && !dialog(); i++) await settle(1)
    await settle(2)
    expect(text()).toContain('Generate a diagram')
    const tab = document.querySelector<HTMLButtonElement>('[data-mode="summarise"]')!
    await act(async () => tab.click())
    await settle(2)
    expect(text()).toContain('Summarise your diagram')
    expect(document.querySelector('[data-mode="summarise"]')!.getAttribute('aria-pressed')).toBe('true')
    expect(document.activeElement).toBe(document.querySelector('[data-mode="summarise"]'))
    // Only one sheet at a time.
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1)
    await unmount()
  })

  it('choose -> check (notice, model, scope, counts, Anthropic) -> result: read-only, AI caveat, usage', async () => {
    saveKey(FAKE, 'session')
    const calls = respondWith(ANSWER)
    const { unmount } = await mount()
    await open()
    expect(text()).toContain(AI_MODELS.small.name)
    expect(text()).toContain('Short summary')
    expect(text()).toContain('Nothing in your diagram is changed')
    await choose('Documentation')
    await click('Summarise')

    expect(text()).toContain('Check before sending')
    expect(text()).toContain(NOTICE_TITLE)
    expect(text()).toContain(AI_MODELS.small.name)
    expect(text()).toContain(AI_MODELS.small.id)
    expect(text()).toContain('Whole diagram')
    expect(text()).toContain('Documentation')
    expect(text()).toContain(`${web.nodes.length} shapes, ${web.edges.length} connectors`)
    expect(text()).toContain('Your diagram’s content goes to Anthropic’s API')
    expect(text()).toMatch(/notes|No notes/)
    expect(text()).toContain('(an estimate)')
    expect(calls).toHaveLength(0)

    const before = useDiagramStore.getState().diagram
    await click('Send')
    await until('Copy (Markdown)')
    expect(calls).toHaveLength(1)
    expect(sentPrompt(calls[0]!)).toContain('<diagram>')
    expect(text()).toContain('AI-generated: it may contain mistakes')
    // Rendered safely: the image and link are plain text.
    const result = dialog()!.querySelector('section[aria-label="Summary text"]')!
    expect(result.querySelector('h3')!.textContent).toBe('Overview')
    expect(result.querySelector('img, a, script')).toBeNull()
    expect(result.textContent).toContain('docs (https://evil.example)')
    expect(result.querySelector('strong')!.textContent).toBe('Load balancer')
    // Usage: the model and the counts the API sent back, and the visit's total.
    expect(text()).toContain('Last request: Claude Haiku 4.5: 1,234 input tokens, 56 output tokens.')
    expect(text()).toContain('This visit: 1 request')
    expect(announced()).toContain('Summary ready')
    // Read-only: the diagram is untouched, and no undo step.
    expect(useDiagramStore.getState().diagram).toBe(before)
    expect(useDiagramStore.getState().past).toHaveLength(0)
    expect(dialog()!.innerHTML).not.toContain(FAKE)
    await unmount()
  })

  it('copy, download and regenerate (through the check again)', async () => {
    saveKey(FAKE, 'session')
    updateSettings({ ai: { noticeAcknowledged: true } })
    const calls = respondWith(ANSWER)
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const created: Blob[] = []
    URL.createObjectURL = vi.fn((b: Blob) => (created.push(b), 'blob:x')) as typeof URL.createObjectURL
    URL.revokeObjectURL = vi.fn()
    let downloaded = ''
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloaded = this.download
    })
    const { unmount } = await mount()
    await open()
    await click('Summarise')
    expect(text()).not.toContain(NOTICE_TITLE)
    await click('Send')
    await until('Copy (Markdown)')

    await click('Copy (Markdown)')
    await settle(2)
    expect(writeText).toHaveBeenCalledWith(ANSWER)
    expect(text()).toContain('Copied')
    expect(announced()).toBe('Summary copied as Markdown.')

    await click('Download as .md')
    for (let i = 0; i < 200 && !downloaded; i++) await settle(1)
    expect(downloaded).toBe('three-tier-web-app-summary.md')
    expect(await created[0]!.text()).toBe(ANSWER)
    expect(created[0]!.type).toBe('text/markdown')

    await click('Regenerate')
    expect(text()).toContain('Check before sending')
    expect(calls).toHaveLength(1)
    anchorClick.mockRestore()
    await unmount()
  })

  it('selection only: offered when something is selected; the scope captured at the check is what is sent, even if the selection changes while waiting', async () => {
    saveKey(FAKE, 'session')
    updateSettings({ ai: { noticeAcknowledged: true } })
    let release = () => {}
    const calls = respondWith(ANSWER, { delay: new Promise<void>((r) => (release = r)) })
    const [first, second, ...others] = web.nodes
    useDiagramStore.getState().setSelection([first!.id, second!.id])
    const { unmount } = await mount()
    await open()
    expect(text()).toContain('Selected shapes only')
    await click('Summarise')
    expect(text()).toContain('Selected shapes only')
    expect(text()).toContain('2 shapes')
    await click('Send')
    await until('Asking')
    // The selection changes while the request is in flight.
    await act(async () => useDiagramStore.getState().setSelection(others.map((n) => n.id)))
    release()
    await until('Copy (Markdown)')
    const prompt = sentPrompt(calls[0]!)
    expect(prompt).toContain(`"id":"${first!.id}"`)
    expect(prompt).toContain(`"id":"${second!.id}"`)
    for (const n of others) expect(prompt).not.toContain(`"id":"${n.id}"`)
    expect(text()).toContain('selected shapes only')
    await unmount()
  })

  it('hidden layers: a visible count, left out by default, included on request', async () => {
    saveKey(FAKE, 'session')
    updateSettings({ ai: { noticeAcknowledged: true } })
    const layered = parseDiagram(fixtures.layers)
    useDiagramStore.getState().load(layered, { undoable: false })
    const calls = respondWith('Fine.')
    const { unmount } = await mount()
    await open()
    expect(text()).toMatch(/\d+ items? on hidden layers left out/)
    await click('Summarise')
    expect(text()).toMatch(/on hidden layers left out/)
    await click('Cancel')
    await toggle('Include hidden layers')
    expect(text()).toMatch(/on hidden layers will be sent/)
    await click('Summarise')
    expect(text()).toMatch(/on hidden layers included/)
    await click('Send')
    await until('Copy (Markdown)')
    const hiddenNode = layered.nodes.find((n) => n.layerId === 'l_notes')!
    expect(sentPrompt(calls[0]!)).toContain(`"id":"${hiddenNode.id}"`)
    await unmount()
  })

  it('over the size limit: Send is disabled, the limit is explained, and the selection is offered', async () => {
    saveKey(FAKE, 'session')
    updateSettings({ ai: { noticeAcknowledged: true } })
    const n = web.nodes[0]!
    const label = 'A component with a long, descriptive label that goes on'
    const big = { ...web, nodes: Array.from({ length: 2000 }, (_, i) => ({ ...n, id: `n${i}`, label: `${label} ${i}`, groupId: undefined, layerId: undefined })), edges: [], groups: [] }
    useDiagramStore.getState().load(big, { undoable: false })
    useDiagramStore.getState().setSelection(['n1', 'n2'])
    const calls = respondWith('Fine.')
    const { unmount } = await mount()
    await open()
    await choose('Whole diagram')
    await click('Summarise')
    expect(text()).toContain('40,000-token limit')
    expect(text()).toContain('Nothing is cut short')
    expect(button('Send')!.disabled).toBe(true)
    await click('Summarise the selection instead')
    expect(text()).toContain('Selected shapes only')
    expect(text()).not.toContain('40,000-token limit')
    expect(button('Send')!.disabled).toBe(false)
    expect(calls).toHaveLength(0)
    await unmount()
  })

  it('cancel while waiting: back to the choices, nothing changed, announced', async () => {
    saveKey(FAKE, 'session')
    updateSettings({ ai: { noticeAcknowledged: true } })
    let release = () => {}
    respondWith(ANSWER, { delay: new Promise<void>((r) => (release = r)) })
    const { unmount } = await mount()
    await open()
    await click('Summarise')
    await click('Send')
    await until('Asking')
    expect(announced()).toContain('Summarising with Claude Haiku 4.5')
    await click('Cancel')
    release()
    for (let i = 0; i < 600 && !text().includes('Summarise your diagram'); i++) await settle(1)
    expect(text()).toContain('Summarise your diagram')
    expect(text()).not.toContain('Copy (Markdown)')
    expect(announced()).toBe('Summary cancelled. Nothing was changed.')
    // No usage came back, so nothing is shown.
    expect(text()).not.toContain('Last request')
    await unmount()
  })

  it('no usage in the answer: no usage line, no guess', async () => {
    saveKey(FAKE, 'session')
    updateSettings({ ai: { noticeAcknowledged: true } })
    respondWith(ANSWER, { usage: null })
    const { unmount } = await mount()
    await open()
    await click('Summarise')
    await click('Send')
    await until('Copy (Markdown)')
    expect(text()).not.toContain('Last request')
    expect(text()).not.toContain('This visit')
    await unmount()
  })

  it('an empty diagram can’t be summarised', async () => {
    saveKey(FAKE, 'session')
    useDiagramStore.getState().load(parseDiagram(fixtures.empty), { undoable: false })
    const { unmount } = await mount()
    await open()
    expect(text()).toContain('Your diagram is empty')
    expect(button('Summarise')!.disabled).toBe(true)
    await unmount()
  })

  it('with no key: explains, and links to Settings > AI', async () => {
    const { unmount } = await mount()
    await open()
    expect(text()).toContain('Add your API key first')
    expect(text()).toContain('Summarise uses your own Anthropic API key')
    await unmount()
  })
})
