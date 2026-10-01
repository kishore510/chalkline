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
import { AiButton, GenerateSheetHost, openReview, useAiSheet } from './GenerateEntry'
import { forgetKey, saveKey } from './keyStore'
import { AI_MODELS } from './models'
import { resetSecretsForTests } from './redact'
import { useReviewStore } from './reviewStore'
import { useUsageStore } from './usage'

const reveal = vi.hoisted(() => vi.fn())
vi.mock('@/canvas/useCanvasActions', () => ({
  // Centring needs a laid-out canvas; here it's enough to see it asked for.
  useCanvasActions: () => new Proxy({}, { get: (_t, key) => (key === 'revealItems' ? reveal : () => undefined) }),
}))
vi.mock('@/layout/elkWorker', async () => {
  const { default: ELK } = await import('elkjs/lib/elk.bundled.js')
  const elk = new ELK()
  return { getElk: async () => elk }
})

const FAKE = 'sk-ant-api03-FAKE_review_ui_0123456789abcdef-Rv11'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const FINDINGS = {
  findings: [
    { category: 'naming', severity: 'low', title: 'Vague service name', explanation: 'API service says little.', shapeIds: ['api'], suggestion: 'Name it for what it does.' },
    { category: 'single-points-of-failure', severity: 'high', title: 'One database', explanation: 'Everything writes to Postgres.', shapeIds: ['db', 'invented'], suggestion: 'Is there a replica?' },
  ],
}

function respondWith(body: unknown, { delay, raw }: { delay?: Promise<void>; raw?: string } = {}) {
  const calls: RequestInit[] = []
  globalThis.fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    calls.push(init ?? {})
    if (delay) await delay
    if (init?.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    return new Response(JSON.stringify({ content: [{ type: 'text', text: raw ?? JSON.stringify(body) }], stop_reason: 'end_turn', usage: { input_tokens: 1500, output_tokens: 300 } }), { status: 200 })
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
const buttons = (label: string) => [...document.querySelectorAll<HTMLButtonElement>('button:not([data-mode])')].filter((b) => b.textContent?.trim() === label)
const click = async (label: string, index = 0) => {
  const b = buttons(label)[index]
  if (!b) throw new Error(`No button "${label}" in: ${text()}`)
  await act(async () => b.click())
}
const check = async (label: string) => {
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
  await act(async () => openReview())
  for (let i = 0; i < 400 && !dialog(); i++) await settle(1)
  await settle(2)
}
const sentBody = (call: RequestInit) => JSON.parse(String(call.body)) as { model: string; system: string; messages: { content: string }[] }
const announced = () => useAnnounceStore.getState().message?.text ?? ''

let web: Diagram
beforeEach(() => {
  web = parseDiagram(fixtures['web-architecture'])
  useDiagramStore.getState().load(web, { undoable: false })
  updateSettings({ ai: { noticeAcknowledged: true } })
  useUsageStore.getState().reset()
  useReviewStore.getState().reset()
  reveal.mockClear()
})
afterEach(async () => {
  useAiSheet.getState().closeGenerate()
  useAiSheet.getState().setMode('generate')
  forgetKey()
  resetSecretsForTests()
  document.body.innerHTML = ''
})

describe('Review sheet', () => {
  it('is a third mode of the AI sheet', async () => {
    saveKey(FAKE, 'session')
    const { unmount } = await mount()
    await open()
    expect(text()).toContain('Review your diagram')
    expect([...document.querySelectorAll('[data-mode]')].map((b) => b.textContent)).toEqual(['Generate', 'Summarise', 'Review'])
    expect(document.querySelector('[data-mode="review"]')!.getAttribute('aria-pressed')).toBe('true')
    await unmount()
  })

  it('local checks need no key, send nothing and say so', async () => {
    const calls = respondWith(FINDINGS)
    useDiagramStore.getState().setNodeLabel('api', 'Service')
    const { unmount } = await mount()
    await open()
    expect(text()).toContain('Open Settings, AI')
    await click('Check locally')
    expect(text()).toContain('Checked locally, nothing sent')
    expect(text()).toContain('starting label')
    expect(text()).not.toContain('AI review')
    expect(calls).toHaveLength(0)
    expect(announced()).toMatch(/Local checks done: \d+ findings?\. Nothing was sent\./)
    await unmount()
  })

  it('AI review: check step (model, scope, counts, Anthropic) -> grouped findings, read-only', async () => {
    saveKey(FAKE, 'session')
    updateSettings({ ai: { noticeAcknowledged: false } })
    const calls = respondWith(FINDINGS)
    const { unmount } = await mount()
    await open()
    const before = useDiagramStore.getState().diagram
    await click('Review with AI')
    expect(text()).toContain('Check before sending')
    expect(text()).toContain(NOTICE_TITLE)
    expect(text()).toContain(AI_MODELS.small.name)
    expect(text()).toContain('Whole diagram')
    expect(text()).toContain(`${web.nodes.length} shapes, ${web.edges.length} connectors`)
    expect(text()).toContain('Your diagram’s content goes to Anthropic’s API')
    expect(text()).toContain('Single points of failure')
    expect(text()).not.toContain('costs more')
    expect(calls).toHaveLength(0)

    await click('Send')
    await until('Checked locally, nothing sent')
    expect(calls).toHaveLength(1)
    expect(sentBody(calls[0]!).model).toBe(AI_MODELS.small.id)
    // Local first, then AI with the high finding before the low one.
    const t = text()
    expect(t.indexOf('Checked locally, nothing sent')).toBeLessThan(t.indexOf('AI review'))
    expect(t.indexOf('One database')).toBeLessThan(t.indexOf('Vague service name'))
    expect(t).toContain('High')
    expect(t).toContain('Low')
    expect(t).toContain('AI review can be wrong or miss things')
    expect(t).toContain('1 shape reference didn’t match anything that was sent')
    expect(t).toContain('Last request: Claude Haiku 4.5: 1,500 input tokens')
    expect(announced()).toMatch(/Review ready: 2 AI findings/)
    // Nothing written into the diagram, and no undo step.
    expect(useDiagramStore.getState().diagram).toBe(before)
    expect(useDiagramStore.getState().canUndo).toBe(false)
    expect(document.body.innerHTML).not.toContain(FAKE)
    await unmount()
  })

  it('Deeper review uses the large model and says it costs more', async () => {
    saveKey(FAKE, 'session')
    const calls = respondWith(FINDINGS)
    const { unmount } = await mount()
    await open()
    await check('Deeper review')
    await click('Review with AI')
    expect(text()).toContain(AI_MODELS.large.name)
    expect(text()).toContain(AI_MODELS.large.id)
    expect(text()).toContain('costs more per token')
    await click('Send')
    await until('AI review')
    expect(sentBody(calls[0]!).model).toBe(AI_MODELS.large.id)
    expect(text()).toContain(AI_MODELS.large.name)
    await unmount()
  })

  it('focus checkboxes change what is asked; none chosen disables the AI review', async () => {
    saveKey(FAKE, 'session')
    const calls = respondWith({ findings: [] })
    const { unmount } = await mount()
    await open()
    for (const name of ['Single points of failure', 'Missing components', 'Data flow and direction', 'Mixed levels of abstraction']) await check(name)
    await click('Review with AI')
    expect(text()).toContain('Looking for')
    expect(text()).toContain('Unclear or inconsistent naming')
    await click('Send')
    await until('No AI findings')
    const system = sentBody(calls[0]!).system
    expect(system).toContain('"naming"')
    expect(system).not.toContain('"missing-components"')
    await click('Change options')
    await check('Unclear or inconsistent naming')
    expect(text()).toContain('Choose at least one')
    expect(buttons('Review with AI')[0]!.disabled).toBe(true)
    await unmount()
  })

  it('Show shapes selects and centres without changing the diagram; the review is still there after', async () => {
    saveKey(FAKE, 'session')
    respondWith(FINDINGS)
    const { unmount } = await mount()
    await open()
    await click('Review with AI')
    await click('Send')
    await until('One database')
    const before = useDiagramStore.getState().diagram
    // The AI findings' buttons come after the local ones; the first AI finding is "One database".
    const showButtons = buttons('Show shapes')
    const forDb = showButtons.find((b) => document.getElementById(b.getAttribute('aria-describedby')!)?.textContent === 'One database')!
    await act(async () => forDb.click())
    await settle(3)
    expect(useDiagramStore.getState().selection).toEqual(['db'])
    expect(reveal).toHaveBeenCalledWith(['db'])
    expect(useDiagramStore.getState().diagram).toBe(before)
    expect(useDiagramStore.getState().canUndo).toBe(false)
    expect(dialog()).toBeNull()
    expect(announced()).toContain('1 item selected and centred')
    await open()
    expect(text()).toContain('One database')
    await unmount()
  })

  it('Show shapes offers to show hidden layers first', async () => {
    useDiagramStore.getState().load(
      parseDiagram({ ...web, layers: [{ id: 'default', name: 'Base', visible: true, locked: false }, { id: 'data', name: 'Data', visible: false, locked: false }], nodes: web.nodes.map((n) => (n.id === 'db' ? { ...n, layerId: 'data' } : n)) }),
      { undoable: false },
    )
    saveKey(FAKE, 'session')
    respondWith(FINDINGS)
    const { unmount } = await mount()
    await open()
    await toggle('Include hidden layers')
    await click('Review with AI')
    await click('Send')
    await until('One database')
    const forDb = buttons('Show shapes').find((b) => document.getElementById(b.getAttribute('aria-describedby')!)?.textContent === 'One database')!
    await act(async () => forDb.click())
    expect(text()).toContain('1 of these is on a hidden layer')
    expect(useDiagramStore.getState().selection).toEqual([])
    await click('Show that layer too')
    await settle(3)
    expect(useDiagramStore.getState().diagram.layers.find((l) => l.id === 'data')!.visible).toBe(true)
    expect(useDiagramStore.getState().selection).toEqual(['db'])
    expect(useDiagramStore.getState().canUndo).toBe(false)
    await unmount()
  })

  it('an edit afterwards marks the results out of date, still readable', async () => {
    saveKey(FAKE, 'session')
    respondWith(FINDINGS)
    const { unmount } = await mount()
    await open()
    await click('Review with AI')
    await click('Send')
    await until('One database')
    expect(text()).not.toContain('The diagram has changed since this review')
    await act(async () => useDiagramStore.getState().setNodeLabel('db', 'Orders DB'))
    expect(text()).toContain('The diagram has changed since this review')
    expect(text()).toContain('One database')
    await unmount()
  })

  it('dismiss hides a finding for this visit; copy all leaves it out', async () => {
    saveKey(FAKE, 'session')
    respondWith(FINDINGS)
    const writeText = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const { unmount } = await mount()
    await open()
    await click('Review with AI')
    await click('Send')
    await until('Vague service name')
    const dismiss = buttons('Dismiss').find((b) => document.getElementById(b.getAttribute('aria-describedby')!)?.textContent === 'Vague service name')!
    await act(async () => dismiss.click())
    expect(text()).not.toContain('Vague service name')
    expect(text()).toContain('Show 1 dismissed finding')
    await click('Copy all (Markdown)')
    await settle(2)
    const md = (writeText.mock.calls[0] as unknown as [string])[0]
    expect(md).toContain('# Review: ')
    expect(md).toContain('**High: One database**')
    expect(md).not.toContain('Vague service name')
    expect(md).not.toContain(FAKE)
    await unmount()
  })

  it('cancel while waiting: nothing shown, nothing changed', async () => {
    saveKey(FAKE, 'session')
    let release = () => {}
    respondWith(FINDINGS, { delay: new Promise<void>((r) => (release = r)) })
    const { unmount } = await mount()
    await open()
    await click('Review with AI')
    await click('Send')
    expect(text()).toContain('Asking Claude Haiku 4.5')
    expect(announced()).toContain('Reviewing with Claude Haiku 4.5')
    await click('Cancel')
    release()
    await until('Review your diagram')
    expect(announced()).toBe('Review cancelled. Nothing was changed.')
    expect(useReviewStore.getState().ai).toBeNull()
    await unmount()
  })

  it('a malformed answer is a friendly error with Retry, and no silent retry', async () => {
    saveKey(FAKE, 'session')
    const calls = respondWith(null, { raw: 'Sure! Here is my review: it looks fine.' })
    const { unmount } = await mount()
    await open()
    await click('Review with AI')
    await click('Send')
    await until('The review couldn’t be read')
    expect(buttons('Retry')).toHaveLength(1)
    await settle(5)
    expect(calls).toHaveLength(1)
    await click('Retry')
    expect(text()).toContain('Check before sending')
    expect(calls).toHaveLength(1)
    await unmount()
  })
})
