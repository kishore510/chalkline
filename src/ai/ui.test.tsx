// @vitest-environment happy-dom
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { fixtures } from '@/fixtures'
import { memoryStorage } from '@/persistence/testStorage'
import { parseDiagram } from '@/schema/diagram'
import { AiSection, statusText } from '@/settings/AiSection'
import { ConfirmSend, NOTICE_TITLE } from './ConfirmSend'
import { forgetKey, saveKey } from './keyStore'
import { AI_MODELS } from './models'
import { buildPayload } from './payload'
import { diagramPlan, testPlan } from './plan'
import { resetSecretsForTests } from './redact'

const FAKE = 'sk-ant-api03-FAKE_ui_test_key_0123456789abcdef-Q7w9'
const noop = () => {}
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/** Renders in a real (happy-dom) document, so stores are read live. */
async function mount(node: React.ReactNode) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  await act(async () => root.render(node))
  return { host, unmount: () => act(() => root.unmount()) }
}

/** Types into a React-controlled input. */
function type(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

afterEach(() => {
  forgetKey()
  forgetKey(memoryStorage())
  resetSecretsForTests()
  document.body.innerHTML = ''
})

describe('confirmation step', () => {
  it('shows the model by name and id, what is sent, and the estimated size', () => {
    const html = renderToStaticMarkup(<ConfirmSend plan={testPlan()} needsNotice={false} onSend={noop} onCancel={noop} />)
    expect(html).toContain('Claude Haiku 4.5')
    expect(html).toContain(AI_MODELS.small.id)
    expect(html).toContain('Nothing from your diagram.')
    expect(html).toContain('2 characters, about 1 token (an estimate)')
    expect(html).toContain('Send')
    expect(html).toContain('Cancel')
    expect(html).not.toContain(NOTICE_TITLE)
  })

  it('carries the one-time notice until it is acknowledged', () => {
    const html = renderToStaticMarkup(<ConfirmSend plan={testPlan()} needsNotice onSend={noop} onCancel={noop} />)
    expect(html).toContain(NOTICE_TITLE)
    expect(html).toContain('leaves this device')
    expect(html).toContain('before sending anything sensitive')
  })

  it('for diagram content: counts of shapes, connectors and notes, the notes toggle, and the size of what is sent', () => {
    const diagram = parseDiagram(fixtures['web-architecture'])
    const built = buildPayload(diagram, { includeNotes: false })
    const plan = diagramPlan('Summarise', AI_MODELS.small, built)
    const html = renderToStaticMarkup(<ConfirmSend plan={plan} needsNotice={false} onSend={noop} onCancel={noop} notes={{ include: false, onChange: noop }} />)
    expect(html).toContain(`${built.counts.nodes} shapes, ${built.counts.edges} connectors`)
    expect(html).toContain('Include notes')
    expect(html).toContain(`${built.json.length.toLocaleString('en-GB')} characters`)
  })
})

describe('Settings > AI', () => {
  it('with no key: the key field (password, no autocomplete) and the plain statement about what is sent', async () => {
    const { host, unmount } = await mount(<AiSection onTest={noop} />)
    const input = host.querySelector('input')!
    expect(input.type).toBe('password')
    expect(input.getAttribute('autocomplete')).toBe('off')
    expect(host.textContent).toContain('No key saved.')
    expect(host.textContent).toContain('Diagram content you choose to send goes to Anthropic’s API')
    expect(host.textContent).toContain('This session only')
    expect(host.textContent).toContain('Remember on this device')
    expect(host.textContent).toContain('Claude Sonnet 5.5')
    await unmount()
  })

  it('show/hide toggles the field; saving empties it, and afterwards only the masked last four are in the page', async () => {
    const { host, unmount } = await mount(<AiSection onTest={noop} />)
    const input = host.querySelector('input')!
    await act(async () => type(input, `  ${FAKE}\n`))
    const toggle = host.querySelector<HTMLButtonElement>('button[aria-label="Show key"]')!
    await act(async () => toggle.click())
    expect(host.querySelector('input')!.type).toBe('text')
    await act(async () => host.querySelector('form')!.requestSubmit())

    expect(host.innerHTML).not.toContain(FAKE)
    expect(host.innerHTML).not.toContain('FAKE_ui_test')
    expect(host.querySelector('input[type="password"], input[type="text"]')).toBeNull()
    expect(host.textContent).toContain('•••• Q7w9')
    expect(host.textContent).toContain('Key saved for this session only')
    for (const label of ['Test key', 'Replace key', 'Remove key']) expect(host.textContent).toContain(label)

    const remove = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Remove key')!
    await act(async () => remove.click())
    expect(host.textContent).toContain('No key saved.')
    await unmount()
  })

  it('choosing "Remember on this device" warns first, and only then moves the key', async () => {
    const storage = globalThis.localStorage
    saveKey(FAKE, 'session')
    const { host, unmount } = await mount(<AiSection onTest={noop} />)
    const remember = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Remember on this device')!
    await act(async () => remember.click())
    expect(host.textContent).toContain('stored unencrypted in this browser')
    expect(storage.getItem('chalkline.ai.key')).toBeNull()

    const confirm = [...host.querySelectorAll<HTMLButtonElement>('[role="group"] button')].filter((b) => b.textContent === 'Remember on this device').at(-1)!
    await act(async () => confirm.click())
    expect(storage.getItem('chalkline.ai.key')).toBe(FAKE)
    expect(host.textContent).toContain('Key remembered on this device')

    const session = [...host.querySelectorAll('button')].find((b) => b.textContent === 'This session only')!
    await act(async () => session.click())
    expect(storage.getItem('chalkline.ai.key')).toBeNull()
    await unmount()
  })

  it('status line covers no key, session, device and the last test', () => {
    expect(statusText(null, '', false, null)).toBe('No key saved.')
    expect(statusText('session', 'abcd', false, null)).toContain('for this session only')
    expect(statusText('device', 'abcd', false, null)).toContain('remembered on this device')
    expect(statusText('device', 'abcd', true, null)).toContain('Testing')
    expect(statusText('session', 'abcd', false, { ok: false, at: 0 })).toContain('didn’t work')
    expect(statusText('session', 'abcd', false, { ok: true, at: 0 })).toContain('worked')
  })
})

describe('no logging in the AI code', () => {
  it('nothing under src/ai writes to the console', () => {
    const dir = join(import.meta.dirname)
    const offenders = readdirSync(dir)
      .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
      .filter((f) => /\bconsole\./.test(readFileSync(join(dir, f), 'utf8')))
    expect(offenders).toEqual([])
  })
})
