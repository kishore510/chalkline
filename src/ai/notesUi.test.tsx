// @vitest-environment happy-dom
import { ReactFlowProvider } from '@xyflow/react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAnnounceStore } from '@/a11y/announce'
import { fixtures } from '@/fixtures'
import { parseDiagram } from '@/schema/diagram'
import { updateSettings } from '@/settings/settingsStore'
import { useDiagramStore } from '@/store/diagramStore'
import { useRefineLog } from './refineNarrative'
import { GenerateSheetHost, openNotes, useAiSheet } from './GenerateEntry'
import { forgetKey, saveKey } from './keyStore'
import { AI_MODELS } from './models'
import { NEIGHBOUR_CAP } from './notesPrompt'
import { useNotesStore } from './notesStore'
import { resetSecretsForTests } from './redact'
import { useUsageStore } from './usage'

const FAKE = 'sk-ant-api03-FAKE_notes_ui_0123456789abcdef-NoUi'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function respondWith(text: string, { delay }: { delay?: Promise<void> } = {}) {
  const calls: RequestInit[] = []
  globalThis.fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    calls.push(init ?? {})
    if (delay) await delay
    if (init?.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    return new Response(JSON.stringify({ content: [{ type: 'text', text }], stop_reason: 'end_turn', usage: { input_tokens: 700, output_tokens: 60 } }), { status: 200 })
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
const click = async (label: string, index = 0) => {
  const b = buttons(label)[index]
  if (!b) throw new Error(`No button "${label}" in: ${text()}`)
  await act(async () => b.click())
}
async function settle(times = 30) {
  for (let i = 0; i < times; i++) await act(async () => new Promise((r) => setTimeout(r, 5)))
}
async function until(what: string) {
  for (let i = 0; i < 600 && !text().includes(what); i++) await settle(1)
}
async function open() {
  await act(async () => openNotes())
  for (let i = 0; i < 400 && !dialog(); i++) await settle(1)
  await settle(2)
}
const card = (ref: string) => document.querySelector<HTMLElement>(`[data-card="${ref}"]`)!
async function type(area: HTMLTextAreaElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(area, value)
    area.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
const sentPrompt = (call: RequestInit) => (JSON.parse(String(call.body)) as { messages: { content: string }[] }).messages[0]!.content
const announced = () => useAnnounceStore.getState().message?.text ?? ''
const notesOf = (id: string) => useDiagramStore.getState().diagram.nodes.find((n) => n.id === id)!.notes

const ANSWER = JSON.stringify({
  suggestions: [
    { ref: 'e1', note: 'Called by the web app; reads and writes Postgres.', reason: 'Its two connectors.' },
    { ref: 'e2', note: 'Appears to be the main data store.' },
  ],
})

beforeEach(() => {
  useRefineLog.getState().reset()
  useDiagramStore.getState().load(parseDiagram(fixtures['web-architecture']), { undoable: false })
  updateSettings({ ai: { noticeAcknowledged: false } })
  useUsageStore.getState().reset()
  useNotesStore.getState().reset()
})
afterEach(() => {
  useAiSheet.getState().closeGenerate()
  useAiSheet.getState().setMode('generate')
  forgetKey()
  resetSecretsForTests()
  document.body.innerHTML = ''
})

describe('Suggest notes sheet', () => {
  it('is a mode of the AI sheet; with no selection it shows a hint and Suggest notes is disabled', async () => {
    saveKey(FAKE, 'session')
    const { unmount } = await mount()
    await open()
    expect([...document.querySelectorAll('[data-mode]')].map((b) => b.textContent)).toEqual(['Generate', 'Summarise', 'Review', 'Notes', 'Refine'])
    expect(document.querySelector('[data-mode="notes"]')!.getAttribute('aria-pressed')).toBe('true')
    expect(text()).toContain('Select 1 to 5 shapes first')
    expect(buttons('Suggest notes')[0]!.disabled).toBe(true)
    await unmount()
  })

  it('more than five selected: says so and asks for fewer', async () => {
    saveKey(FAKE, 'session')
    const d = useDiagramStore.getState().diagram
    useDiagramStore.getState().setSelection(d.nodes.map((n) => n.id))
    const { unmount } = await mount()
    await open()
    expect(text()).toContain('6 shapes are selected')
    expect(text()).toContain('select fewer')
    expect(buttons('Suggest notes')[0]!.disabled).toBe(true)
    await unmount()
  })

  it('with no key: explains and links to Settings', async () => {
    const { unmount } = await mount()
    await open()
    expect(text()).toContain('your own Anthropic API key')
    expect(buttons('Open Settings, AI')).toHaveLength(1)
    await unmount()
  })

  it('select -> check (model, scope, cap, Anthropic) -> cards -> edit -> Accept one, Accept all: one undo step each', async () => {
    saveKey(FAKE, 'session')
    useDiagramStore.getState().setSelection(['api', 'db'])
    const calls = respondWith(ANSWER)
    const { unmount } = await mount()
    await open()
    expect(text()).toContain('2 selected shapes')
    expect(text()).toContain(AI_MODELS.small.name)
    expect(text()).toContain('1 note left out')
    await click('Suggest notes')
    await settle(2)
    expect(text()).toContain('Check before sending')
    expect(text()).toContain('Claude Haiku 4.5')
    expect(text()).toContain('claude-haiku-4-5-20251001')
    expect(text()).toContain('Anthropic’s API')
    expect(text()).toContain(`At most ${NEIGHBOUR_CAP} connections per shape`)
    expect(text()).toContain('“API service”, “Postgres”')
    expect(text()).toContain('Before your first AI request')
    expect(calls).toHaveLength(0)
    await click('Send')
    await until('Suggested notes')
    await settle(2)
    expect(calls).toHaveLength(1)
    expect(sentPrompt(calls[0]!)).toContain('"hasNote":true')
    expect(sentPrompt(calls[0]!)).not.toContain('Stateless')
    expect(announced()).toContain('2 notes suggested')
    expect(text()).toContain('AI suggestions can be wrong')
    expect(text()).toContain('Claude Haiku 4.5: 700 input tokens')

    // The shape with a note offers only "Append to existing note"; the other plain Accept.
    expect(card('e1').textContent).toContain('Current note')
    expect(card('e1').textContent).toContain('Stateless; scales horizontally.')
    expect([...card('e1').querySelectorAll('button')].map((b) => b.textContent?.trim())).toEqual(['Append to existing note', 'Show shape', 'Dismiss'])
    expect([...card('e2').querySelectorAll('button')].map((b) => b.textContent?.trim())).toEqual(['Accept', 'Show shape', 'Dismiss'])
    expect(card('e1').textContent).toContain('Why: Its two connectors.')

    // Edit, then accept: the edited text is what's saved.
    await type(card('e2').querySelector('textarea')!, 'Stores orders.')
    expect(card('e2').textContent).toContain('14 of 300 characters')
    const past = useDiagramStore.getState().past.length
    await act(async () => card('e2').querySelector<HTMLButtonElement>('button')!.click())
    expect(notesOf('db')).toBe('Stores orders.')
    expect(useDiagramStore.getState().past.length).toBe(past + 1)
    expect(announced()).toContain('Accepted 1 note')
    expect(card('e2').textContent).toContain('Accepted')

    // Accept all takes the rest, in one step; undo restores exactly.
    await click('Accept all')
    expect(notesOf('api')).toBe('Stateless; scales horizontally.\n\nCalled by the web app; reads and writes Postgres.')
    expect(useDiagramStore.getState().past.length).toBe(past + 2)
    await act(async () => useDiagramStore.getState().undo())
    expect(notesOf('api')).toBe('Stateless; scales horizontally.')
    expect(notesOf('db')).toBe('Stores orders.')
    // Each accept is in the AI change log, with the AI's reasons; the log doesn't open by itself.
    const log = useRefineLog.getState()
    expect(log.open).toBe(false)
    expect(log.entries.map((e) => [e.feature, e.summary])).toEqual([
      ['notes', 'Added a suggested note.'],
      ['notes', 'Added a suggested note.'],
    ])
    expect(log.entries[0]!.items).toEqual([{ key: 'e1', kind: 'added', text: 'Added a note to “API service”', why: 'Its two connectors.', ids: ['api'] }])
    await unmount()
  })

  it('over the limit: Accept is disabled until shortened', async () => {
    saveKey(FAKE, 'session')
    useDiagramStore.getState().setSelection(['db'])
    respondWith(JSON.stringify({ suggestions: [{ ref: 'e1', note: 'Short.' }] }))
    const { unmount } = await mount()
    await open()
    await click('Suggest notes')
    await click('Send')
    await until('Suggested notes')
    const area = card('e1').querySelector('textarea')!
    await type(area, 'x'.repeat(301))
    expect(card('e1').textContent).toContain('1 over')
    expect(area.getAttribute('aria-invalid')).toBe('true')
    expect(buttons('Accept')[0]!.disabled).toBe(true)
    await type(area, 'x'.repeat(300))
    expect(buttons('Accept')[0]!.disabled).toBe(false)
    await unmount()
  })

  it('a stale card needs "accept anyway"; a deleted shape drops off', async () => {
    saveKey(FAKE, 'session')
    useDiagramStore.getState().setSelection(['api', 'db'])
    respondWith(ANSWER)
    const { unmount } = await mount()
    await open()
    await click('Suggest notes')
    await click('Send')
    await until('Suggested notes')
    await act(async () => useDiagramStore.getState().setNodeLabel('db', 'Orders DB'))
    expect(card('e2').textContent).toContain('Changed since this suggestion')
    expect(buttons('Accept')[0]!.disabled).toBe(true)
    await act(async () => card('e2').querySelector<HTMLInputElement>('input[type="checkbox"]')!.click())
    expect(buttons('Accept')[0]!.disabled).toBe(false)
    await act(async () => useDiagramStore.getState().deleteElements(['api']))
    expect(document.querySelector('[data-card="e1"]')).toBeNull()
    expect(text()).toContain('1 suggestion')
    await unmount()
  })

  it('Show shape selects and centres it and closes the sheet; the cards come back', async () => {
    saveKey(FAKE, 'session')
    useDiagramStore.getState().setSelection(['api', 'db'])
    respondWith(ANSWER)
    const { unmount } = await mount()
    await open()
    await click('Suggest notes')
    await click('Send')
    await until('Suggested notes')
    const before = useDiagramStore.getState().diagram
    await act(async () => [...card('e2').querySelectorAll('button')].find((b) => b.textContent?.includes('Show shape'))!.click())
    expect(useDiagramStore.getState().selection).toEqual(['db'])
    expect(useDiagramStore.getState().diagram).toBe(before)
    expect(dialog()).toBeNull()
    await open()
    expect(text()).toContain('Suggested notes')
    await unmount()
  })

  it('Dismiss hides a card, and Accept all skips it', async () => {
    saveKey(FAKE, 'session')
    useDiagramStore.getState().setSelection(['api', 'db'])
    respondWith(ANSWER)
    const { unmount } = await mount()
    await open()
    await click('Suggest notes')
    await click('Send')
    await until('Suggested notes')
    await act(async () => [...card('e1').querySelectorAll('button')].find((b) => b.textContent?.includes('Dismiss'))!.click())
    expect(document.querySelector('[data-card="e1"]')).toBeNull()
    await click('Accept all')
    expect(notesOf('api')).toBe('Stateless; scales horizontally.')
    expect(notesOf('db')).toBe('Appears to be the main data store.')
    await click('Show 1 dismissed suggestion')
    expect(document.querySelector('[data-card="e1"]')).not.toBeNull()
    await unmount()
  })

  it('a malformed answer: friendly problem with Retry, which goes through the check again; no silent retry', async () => {
    saveKey(FAKE, 'session')
    useDiagramStore.getState().setSelection(['db'])
    const calls = respondWith('not json at all')
    const { unmount } = await mount()
    await open()
    await click('Suggest notes')
    await click('Send')
    await until('couldn’t be read')
    expect(calls).toHaveLength(1)
    expect(text()).toContain('The suggestions couldn’t be read')
    expect(announced()).toContain('couldn’t be read')
    await click('Retry')
    expect(text()).toContain('Check before sending')
    expect(calls).toHaveLength(1)
    await unmount()
  })

  it('Cancel while waiting stops the request and changes nothing', async () => {
    saveKey(FAKE, 'session')
    useDiagramStore.getState().setSelection(['db'])
    let release!: () => void
    respondWith(ANSWER, { delay: new Promise<void>((r) => (release = r)) })
    const before = useDiagramStore.getState().diagram
    const { unmount } = await mount()
    await open()
    await click('Suggest notes')
    await click('Send')
    await until('Asking')
    await click('Cancel')
    release()
    await until('Suggest notes')
    await settle(2)
    expect(announced()).toContain('Cancelled')
    expect(useDiagramStore.getState().diagram).toBe(before)
    expect(useNotesStore.getState().run).toBeNull()
    await unmount()
  })
})
