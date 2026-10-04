// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { ReactFlowProvider } from '@xyflow/react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAnnounceStore } from '@/a11y/announce'
import { fixtures } from '@/fixtures'
import { parseDiagram } from '@/schema/diagram'
import { updateSettings } from '@/settings/settingsStore'
import { useDiagramStore } from '@/store/diagramStore'
import { MODES } from './AiSheetFrame'
import { AI_BUTTON_LABEL, GenerateSheetHost, openRefine, useAiSheet } from './GenerateEntry'
import { forgetKey, saveKey } from './keyStore'
import { AI_MODELS } from './models'
import { resetSecretsForTests } from './redact'
import { RefineLogPanel } from './RefineLog'
import { useRefineLog } from './refineNarrative'
import { NOTHING_SILENT, REFINE_EXAMPLES } from './RefineSheet'
import { useUsageStore } from './usage'

/*
 * The Refine mode of the AI sheet (6f), with canned answers: no live API
 * calls. ELK runs for real (the bundled build, standing in for the worker).
 */

vi.mock('@/layout/elkWorker', async () => {
  const { default: ELK } = await import('elkjs/lib/elk.bundled.js')
  const elk = new ELK()
  return { getElk: async () => elk }
})

const FAKE = 'sk-ant-api03-FAKE_refine_ui_0123456789abcdef-RfUi'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function respondWith(text: string, { delay }: { delay?: Promise<void> } = {}) {
  const calls: RequestInit[] = []
  globalThis.fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    calls.push(init ?? {})
    if (delay) await delay
    if (init?.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    return new Response(JSON.stringify({ content: [{ type: 'text', text }], stop_reason: 'end_turn', usage: { input_tokens: 4000, output_tokens: 200 } }), { status: 200 })
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
        <GenerateSheetHost />
      </ReactFlowProvider>,
    ),
  )
  return { unmount: () => act(() => root.unmount()) }
}

const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]')
const text = () => dialog()?.textContent ?? ''
const buttons = (label: string) => [...document.querySelectorAll<HTMLButtonElement>('button:not([data-mode])')].filter((b) => b.textContent?.trim() === label)
const click = async (label: string) => {
  const b = buttons(label)[0]
  if (!b) throw new Error(`No button "${label}" in: ${text()}`)
  await act(async () => b.click())
}
async function settle(times = 30) {
  for (let i = 0; i < times; i++) await act(async () => new Promise((r) => setTimeout(r, 5)))
}
async function until(what: string) {
  for (let i = 0; i < 800 && !text().includes(what); i++) await settle(1)
  if (!text().includes(what)) throw new Error(`Never saw "${what}" in: ${text()}`)
}
async function open() {
  await act(async () => openRefine())
  for (let i = 0; i < 400 && !dialog(); i++) await settle(1)
  await settle(2)
}
async function type(area: HTMLTextAreaElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(area, value)
    area.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
const field = () => dialog()!.querySelector<HTMLTextAreaElement>('textarea')!
const sentPrompt = (call: RequestInit) => (JSON.parse(String(call.body)) as { messages: { content: string }[] }).messages[0]!.content
const announced = () => useAnnounceStore.getState().message?.text ?? ''
const store = () => useDiagramStore.getState()

const CACHE = JSON.stringify({
  nodes: [{ id: 'cache', label: 'Cache', shape: 'cache', color: 'teal' }],
  edges: [
    { from: 'e1', to: 'cache' },
    { from: 'cache', to: 'e2' },
  ],
})

beforeEach(() => {
  useRefineLog.getState().reset()
  store().load(parseDiagram(fixtures['web-architecture']), { undoable: false })
  store().setSelection([])
  updateSettings({ ai: { noticeAcknowledged: true } })
  useUsageStore.getState().reset()
})
afterEach(() => {
  useAiSheet.getState().closeGenerate()
  useAiSheet.getState().setMode('generate')
  forgetKey()
  resetSecretsForTests()
  document.body.innerHTML = ''
})

describe('five modes', () => {
  it('Refine is a fifth tab, always shown; with no selection it says to select shapes first', async () => {
    saveKey(FAKE, 'session')
    const { unmount } = await mount()
    await open()
    expect([...document.querySelectorAll('[data-mode]')].map((b) => b.textContent)).toEqual(['Generate', 'Summarise', 'Review', 'Notes', 'Refine'])
    expect(MODES.map((m) => m.id)).toEqual(['generate', 'summarise', 'review', 'notes', 'refine'])
    expect(document.querySelector('[data-mode="refine"]')!.getAttribute('aria-pressed')).toBe('true')
    expect(text()).toContain('Select one or more shapes first')
    expect(buttons('Generate')[0]!.disabled).toBe(true)
    expect(AI_BUTTON_LABEL).toContain('refine')
    await unmount()
  })

  it('fit at 360px without clipping: three then two, wrapping (never truncating) with large text, 44px targets', async () => {
    saveKey(FAKE, 'session')
    const { unmount } = await mount()
    await open()
    const group = document.querySelector('[role="group"][aria-label="AI action"]')!
    expect(group.className).toContain('flex-wrap')
    for (const tab of document.querySelectorAll<HTMLElement>('[data-mode]')) {
      expect(tab.className).toContain('basis-(--cl-ai-mode-basis)')
      expect(tab.className).toContain('grow')
      expect(tab.className).toContain('min-h-touch')
      expect(tab.className).toContain('whitespace-nowrap')
      expect(tab.className).not.toMatch(/truncate|overflow-hidden|text-ellipsis/)
    }
    // A third of the row each (less the gaps): three on the first row, two on the second.
    const tokens = readFileSync('src/styles/tokens.css', 'utf8')
    expect(tokens).toMatch(/--cl-ai-mode-basis: calc\(\(100% - 3 \* var\(--spacing\)\) \/ 3\);/)
    await unmount()
  })

  it('switching to another mode and back keeps the other modes as they were', async () => {
    saveKey(FAKE, 'session')
    const { unmount } = await mount()
    await open()
    await act(async () => document.querySelector<HTMLButtonElement>('[data-mode="generate"]')!.click())
    expect(text()).toContain('Describe the diagram')
    await act(async () => document.querySelector<HTMLButtonElement>('[data-mode="notes"]')!.click())
    expect(text()).toContain('Suggest notes')
    await act(async () => document.querySelector<HTMLButtonElement>('[data-mode="refine"]')!.click())
    expect(text()).toContain('What should be added or improved?')
    await unmount()
  })

  it('with no key: explains and links to Settings', async () => {
    const { unmount } = await mount()
    await open()
    expect(text()).toContain('your own Anthropic API key')
    expect(buttons('Open Settings, AI')).toHaveLength(1)
    await unmount()
  })
})

describe('Refine sheet', () => {
  it('select -> instruction -> check (model, scope, size) -> preview -> Apply: one undo step, selected, logged', async () => {
    saveKey(FAKE, 'session')
    store().setSelection(['web', 'api'])
    const calls = respondWith(CACHE)
    const { unmount } = await mount()
    await open()
    expect(text()).toContain('2 selected shapes')
    expect(text()).toContain(AI_MODELS.large.name)
    // Example chips only insert text.
    await click(REFINE_EXAMPLES[0].label)
    expect(field().value).toBe(REFINE_EXAMPLES[0].text)
    expect(calls).toHaveLength(0)
    await type(field(), 'Add a cache between these two.')
    expect(text()).toContain('30 of 1,000 characters')
    await click('Generate')
    await settle(2)
    expect(text()).toContain('Check before sending')
    expect(text()).toContain(AI_MODELS.large.name)
    expect(text()).toContain('2 selected shapes and 2 connected shapes (4 of at most 30)')
    expect(text()).toMatch(/about [\d,]+ tokens/)
    await click('Send')
    expect(announced()).toContain(`Refining with ${AI_MODELS.large.name}`)
    await until('Apply')
    expect(text()).toContain('1 new shape, 2 new connectors (2 to existing shapes)')
    expect(text()).toContain(NOTHING_SILENT)
    expect(text()).toContain('Faded: 2 existing shapes')
    expect(announced()).toContain('Ready: 1 new shape')
    // The drawing itself (faded anchors included) is checked in refine.test.tsx; happy-dom drops its content here.
    expect(dialog()!.querySelector('svg')).not.toBeNull()
    expect(sentPrompt(calls[0]!)).toContain('Add a cache between these two.')
    expect(text()).not.toContain(FAKE)

    const before = store().diagram
    const past = store().past.length
    await click('Apply')
    await settle(2)
    expect(store().past.length).toBe(past + 1)
    const cache = store().diagram.nodes.find((n) => n.label === 'Cache')!
    expect(store().selection).toContain(cache.id)
    expect(store().diagram.edges.find((e) => e.id === 'e_web_api')).toBeDefined()
    expect(announced()).toContain('Applied 1 new shape, 2 new connectors')
    expect(dialog()).toBeNull()
    store().undo()
    expect(store().diagram).toEqual(before)
    await unmount()
  })

  it('nothing to change: the summary, and no Apply button', async () => {
    saveKey(FAKE, 'session')
    store().setSelection(['web'])
    respondWith(JSON.stringify({ nodes: [], edges: [], changes: [], summary: 'Renaming can’t be done by adding.' }))
    const { unmount } = await mount()
    await open()
    await type(field(), 'Rename this to Frontend.')
    await click('Generate')
    await settle(2)
    await click('Send')
    await until('Nothing to change')
    expect(text()).toContain('The AI said: Renaming can’t be done by adding.')
    expect(buttons('Apply')).toHaveLength(0)
    expect(buttons('Edit instruction')).toHaveLength(1)
    expect(buttons('Regenerate')).toHaveLength(1)
    expect(announced()).toContain('Nothing to change.')
    await unmount()
  })

  it('a request uses the selection captured at the check step, whatever is selected after', async () => {
    saveKey(FAKE, 'session')
    store().setSelection(['user'])
    let release = () => {}
    const delay = new Promise<void>((r) => (release = r))
    const calls = respondWith(JSON.stringify({ nodes: [{ id: 'x', label: 'Login', shape: 'rounded' }], edges: [{ from: 'e1', to: 'x' }] }), { delay })
    const { unmount } = await mount()
    await open()
    await type(field(), 'Add a login step.')
    await click('Generate')
    await settle(2)
    // Changed after the check step: the captured selection still goes.
    await act(async () => store().setSelection(['db']))
    await click('Send')
    await settle(2)
    expect(text()).toContain('selected when you pressed Send')
    await act(async () => store().setSelection(['note']))
    release()
    await until('Apply')
    const prompt = sentPrompt(calls[0]!)
    expect(prompt).toContain('Customer')
    expect(prompt).not.toContain('Postgres')
    expect(prompt).not.toContain('All traffic over TLS')
    expect(text()).toContain('The selection has changed since you sent this')
    await click('Apply')
    await settle(2)
    const login = store().diagram.nodes.find((n) => n.label === 'Login')!
    expect(store().diagram.edges.some((e) => e.source === 'user' && e.target === login.id)).toBe(true)
    await unmount()
  })

  it('says when the selection changes while the sheet is open', async () => {
    saveKey(FAKE, 'session')
    store().setSelection(['web'])
    const { unmount } = await mount()
    await open()
    expect(text()).toContain('follows the selection until you choose Generate')
    await act(async () => store().setSelection(['web', 'api']))
    expect(text()).toContain('The selection changed: what’s sent will use the shapes selected now.')
    expect(text()).toContain('2 selected shapes')
    await unmount()
  })

  it('a locked active layer: Apply explains, keeps the preview and offers Switch layer', async () => {
    saveKey(FAKE, 'session')
    store().setSelection(['web', 'api'])
    respondWith(CACHE)
    const { unmount } = await mount()
    await open()
    await type(field(), 'Add a cache.')
    await click('Generate')
    await settle(2)
    await click('Send')
    await until('Apply')
    await act(async () => store().setLayerLocked(store().activeLayerId, true))
    const before = store().diagram
    await click('Apply')
    expect(store().diagram).toBe(before)
    expect(text()).toContain('hidden or locked')
    expect(buttons('Switch layer')).toHaveLength(1)
    await unmount()
  })

  it('fixes: each with its reason and a tick box; an unticked fix isn’t applied; the story goes to the change log', async () => {
    saveKey(FAKE, 'session')
    store().setSelection(['web', 'api'])
    respondWith(
      JSON.stringify({
        summary: 'Gave the API a clearer name and made the web app a plain box like the other services.',
        nodes: [],
        edges: [],
        changes: [
          { action: 'relabel', ref: 'e2', label: 'Orders API', why: 'Says what it serves.' },
          { action: 'reshape', ref: 'e1', shape: 'rectangle', why: 'Matches the other services.' },
        ],
      }),
    )
    const { unmount } = await mount()
    await open()
    await type(field(), 'Tidy this up.')
    await click('Generate')
    await settle(2)
    await click('Send')
    await until('Apply')
    expect(text()).toContain('2 fixes')
    expect(text()).toContain('Gave the API a clearer name')
    expect(text()).toContain('Renamed “API service” to “Orders API”')
    expect(text()).toContain('Why: Says what it serves.')
    expect(text()).toContain('Fixes to what’s there')
    const boxes = [...dialog()!.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')]
    expect(boxes.map((b) => b.checked)).toEqual([true, true])
    expect(boxes[1]!.getAttribute('aria-label')).toBe('Apply: Changed “Web app” from a rounded box to a rectangle')
    await act(async () => boxes[1]!.click())

    const past = store().past.length
    await click('Apply')
    await settle(2)
    expect(store().past.length).toBe(past + 1)
    expect(store().diagram.nodes.find((n) => n.id === 'api')!.label).toBe('Orders API')
    expect(store().diagram.nodes.find((n) => n.id === 'web')!.type).toBe('rounded')
    expect(announced()).toContain('Applied 1 fix')

    const { entries, open: logOpen } = useRefineLog.getState()
    expect(logOpen).toBe(true)
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ instruction: 'Tidy this up.', summary: expect.stringContaining('clearer name') })
    expect(entries[0]!.items.map((i) => [i.kind, i.text, i.why])).toEqual([['fixed', 'Renamed “API service” to “Orders API”', 'Says what it serves.']])
    await unmount()
  })
})

describe('AI change log', () => {
  it('lists each refinement with its summary and reasons; a line selects its items; Undo works while nothing else changed', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    await act(async () =>
      root.render(
        <ReactFlowProvider>
          <RefineLogPanel />
        </ReactFlowProvider>,
      ),
    )
    const panel = () => document.querySelector<HTMLElement>('aside[aria-label="AI change log"]')!
    expect(panel().getAttribute('aria-hidden')).toBe('true')

    store().applyRefinement({ nodes: [], edges: [], fixes: [{ key: 'f1', why: 'Says what it serves.', action: 'relabel', target: 'node', id: 'api', label: 'Orders API' }] })
    await act(async () =>
      useRefineLog.getState().add({
        at: Date.now(),
        instruction: 'Tidy this up.',
        summary: 'A clearer name for the API.',
        items: [{ key: 'f1', kind: 'fixed', text: 'Renamed “API service” to “Orders API”', why: 'Says what it serves.', ids: ['api'] }],
        historySize: store().past.length,
      }),
    )
    expect(panel().getAttribute('aria-hidden')).toBe('false')
    const content = panel().textContent ?? ''
    expect(content).toContain('You asked: “Tidy this up.”')
    expect(content).toContain('A clearer name for the API.')
    expect(content).toContain('Why: Says what it serves.')

    await act(async () => store().setSelection([]))
    const line = [...panel().querySelectorAll('button')].find((b) => b.textContent?.includes('Renamed'))!
    await act(async () => line.click())
    expect(store().selection).toEqual(['api'])

    const undo = [...panel().querySelectorAll('button')].find((b) => b.textContent?.includes('Undo this refinement'))!
    await act(async () => undo.click())
    expect(store().diagram.nodes.find((n) => n.id === 'api')!.label).toBe('API service')
    // Undone: the button goes (the history no longer matches).
    expect([...panel().querySelectorAll('button')].some((b) => b.textContent?.includes('Undo this refinement'))).toBe(false)

    const close = panel().querySelector<HTMLButtonElement>('button[aria-label="Close the AI change log"]')!
    await act(async () => close.click())
    expect(useRefineLog.getState().open).toBe(false)
    await act(async () => root.unmount())
  })
})
