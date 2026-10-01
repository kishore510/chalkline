import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  API_VERSION,
  buildCountTokensRequest,
  buildMessagesRequest,
  mapHttpError,
  parseRetryAfter,
  send,
  sendMessage,
  testKey,
  type ApiRequest,
} from './client'
import { TEST_PROMPT } from './plan'
import { AI_MODELS } from './models'
import { containsSecret, registerSecret, resetSecretsForTests } from './redact'

const FAKE = 'sk-ant-api03-FAKE_client_test_0123456789abcdef'
const model = AI_MODELS.small

afterEach(() => {
  vi.useRealTimers()
  resetSecretsForTests()
})

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })

const apiError = (type: string, message: string, extra: Record<string, unknown> = {}) => ({ type: 'error', error: { type, message, ...extra }, request_id: 'req_test_1' })

/** A fetch that records what it was given and answers with `response`. */
function mockFetch(response: Response | (() => Promise<Response>)) {
  const calls: { url: string; init: RequestInit }[] = []
  const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    return typeof response === 'function' ? response() : response
  })
  return { fetch: fn as unknown as typeof fetch, calls }
}

const req = (): ApiRequest => buildCountTokensRequest(FAKE, model, TEST_PROMPT)
const always = () => true

describe('request builder', () => {
  it('sets the key, version, content type and browser opt-in headers', () => {
    for (const r of [req(), buildMessagesRequest(FAKE, { model, prompt: 'Summarise', maxTokens: 512 })]) {
      expect(r.init.headers).toEqual({
        'content-type': 'application/json',
        'x-api-key': FAKE,
        'anthropic-version': API_VERSION,
        'anthropic-dangerous-direct-browser-access': 'true',
      })
      expect(r.init.method).toBe('POST')
      expect(r.init.credentials).toBe('omit')
      expect(r.init.referrerPolicy).toBe('no-referrer')
    }
    expect(API_VERSION).toBe('2023-06-01')
  })

  it('never puts the key in the URL or the body', () => {
    const r = buildMessagesRequest(FAKE, { model, system: 'Be brief', prompt: 'Hello', maxTokens: 100 })
    expect(r.url).toBe('https://api.anthropic.com/v1/messages')
    expect(r.url).not.toContain(FAKE)
    expect(r.init.body).not.toContain(FAKE)
    expect(JSON.parse(r.init.body)).toEqual({ model: model.id, max_tokens: 100, system: 'Be brief', messages: [{ role: 'user', content: 'Hello' }] })
  })

  it('the key test uses the free token-counting endpoint with a one-word message', () => {
    expect(req().url).toBe('https://api.anthropic.com/v1/messages/count_tokens')
    expect(JSON.parse(req().init.body)).toEqual({ model: model.id, messages: [{ role: 'user', content: 'Hi' }] })
  })

  it('sends exactly the built request through fetch', async () => {
    const { fetch, calls } = mockFetch(json(200, { input_tokens: 8 }))
    const outcome = await testKey(FAKE, model, { fetch, online: always })
    expect(outcome).toMatchObject({ ok: true, value: { inputTokens: 8 } })
    expect(calls).toHaveLength(1)
    expect(calls[0]!.url).toBe(req().url)
    expect((calls[0]!.init.headers as Record<string, string>)['x-api-key']).toBe(FAKE)
    expect(calls[0]!.init.signal).toBeInstanceOf(AbortSignal)
  })
})

describe('error mapping', () => {
  const cases: [number, unknown, Record<string, string>, string, string][] = [
    [400, apiError('invalid_request_error', 'max_tokens: must be positive'), {}, 'bad-request', 'ai-bad-request'],
    [401, apiError('authentication_error', 'API key is invalid.'), {}, 'invalid-key', 'ai-invalid-key'],
    [402, apiError('billing_error', 'Payment required'), {}, 'billing', 'ai-billing'],
    [403, apiError('permission_error', 'Not allowed'), {}, 'permission', 'ai-permission'],
    [404, apiError('not_found_error', 'model: claude-x'), {}, 'model-unavailable', 'ai-model-unavailable'],
    [413, apiError('request_too_large', 'Too big'), {}, 'too-large', 'ai-too-large'],
    [429, apiError('rate_limit_error', 'Slow down'), { 'retry-after': '30' }, 'rate-limited', 'ai-rate-limited'],
    [429, apiError('rate_limit_error', 'Monthly cap', { details: { error_code: 'enforced_spend_limit_reached' } }), {}, 'spend-limit', 'ai-spend-limit'],
    [500, apiError('api_error', 'Internal'), {}, 'server', 'ai-server'],
    [504, apiError('timeout_error', 'Timed out'), {}, 'timeout', 'ai-timeout'],
    [529, apiError('overloaded_error', 'Overloaded'), {}, 'overloaded', 'ai-overloaded'],
    [503, null, {}, 'server', 'ai-server'],
  ]

  it.each(cases)('HTTP %i maps to a friendly message', async (status, body, headers, reason, kind) => {
    const { fetch } = mockFetch(body === null ? new Response('<html>', { status }) : json(status, body, headers))
    const outcome = await send(req(), { fetch, online: always })
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.reason).toBe(reason)
    expect(outcome.error.kind).toBe(kind)
    expect(outcome.status).toBe(status)
    expect(outcome.error.title.length).toBeGreaterThan(0)
    if (body) expect(outcome.error.detail).toContain('req_test_1')
  })

  it('a rate limit shows the wait time from retry-after', async () => {
    const { fetch } = mockFetch(json(429, apiError('rate_limit_error', 'Slow down'), { 'retry-after': '30' }))
    const outcome = await send(req(), { fetch, online: always })
    expect(outcome).toMatchObject({ ok: false, retryAfter: 30 })
    if (!outcome.ok) expect(outcome.error.next).toBe('Wait about 30 seconds, then choose Retry.')
    expect(mapHttpError(429, null, new Headers({ 'retry-after': '120' })).error.next).toBe('Wait about 2 minutes, then choose Retry.')
    expect(mapHttpError(429, null, new Headers()).error.next).toBe('Wait a minute, then choose Retry.')
  })

  it('reads retry-after as seconds or as a date', () => {
    expect(parseRetryAfter('12')).toBe(12)
    expect(parseRetryAfter(new Date(10_000 + 45_000).toUTCString(), 10_000)).toBe(45)
    expect(parseRetryAfter('soon')).toBeUndefined()
    expect(parseRetryAfter(null)).toBeUndefined()
  })

  it('a key echoed back in an error never reaches Details', async () => {
    registerSecret(FAKE)
    const { fetch } = mockFetch(json(401, apiError('authentication_error', `Invalid key ${FAKE}`)))
    const outcome = await send(req(), { fetch, online: always })
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(containsSecret(JSON.stringify(outcome))).toBe(false)
  })

  it('a fetch that fails while online is "blocked"; while offline, "offline"', async () => {
    const failing = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    }) as unknown as typeof fetch
    const blocked = await send(req(), { fetch: failing, online: always })
    expect(blocked).toMatchObject({ ok: false, reason: 'blocked', error: { kind: 'ai-blocked' } })
    if (!blocked.ok) expect(blocked.error.message).toContain('Could not reach the API. Your network or browser may be blocking it.')

    let up = true
    const dropping = vi.fn(async () => {
      up = false
      throw new TypeError('NetworkError')
    }) as unknown as typeof fetch
    expect(await send(req(), { fetch: dropping, online: () => up })).toMatchObject({ ok: false, reason: 'offline' })
  })

  it('already offline: nothing is sent', async () => {
    const { fetch, calls } = mockFetch(json(200, {}))
    expect(await send(req(), { fetch, online: () => false })).toMatchObject({ ok: false, reason: 'offline' })
    expect(calls).toHaveLength(0)
  })

  it('a 200 that isn’t the expected shape is "unexpected"', async () => {
    expect(await testKey(FAKE, model, { fetch: mockFetch(json(200, { nope: 1 })).fetch, online: always })).toMatchObject({ ok: false, reason: 'unexpected' })
    expect(await testKey(FAKE, model, { fetch: mockFetch(new Response('not json', { status: 200 })).fetch, online: always })).toMatchObject({ ok: false, reason: 'unexpected' })
  })

  it('never retries on its own', async () => {
    const { fetch, calls } = mockFetch(() => Promise.resolve(json(529, apiError('overloaded_error', 'Overloaded'))))
    await send(req(), { fetch, online: always })
    expect(calls).toHaveLength(1)
  })
})

describe('cancel and timeout', () => {
  /** A fetch that never answers until its signal aborts. */
  const hanging = (() =>
    vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
        }),
    ) as unknown as typeof fetch)

  it('Cancel stops the request', async () => {
    const controller = new AbortController()
    const pending = send(req(), { fetch: hanging(), signal: controller.signal, online: always })
    controller.abort()
    expect(await pending).toMatchObject({ ok: false, reason: 'cancelled', error: { kind: 'ai-cancelled' } })
  })

  it('an already-cancelled signal sends nothing', async () => {
    const controller = new AbortController()
    controller.abort()
    const { fetch, calls } = mockFetch(json(200, {}))
    expect(await send(req(), { fetch, signal: controller.signal, online: always })).toMatchObject({ reason: 'cancelled' })
    expect(calls).toHaveLength(0)
  })

  it('times out after the limit', async () => {
    vi.useFakeTimers()
    const pending = send(req(), { fetch: hanging(), timeoutMs: 5_000, online: always })
    await vi.advanceTimersByTimeAsync(5_000)
    expect(await pending).toMatchObject({ ok: false, reason: 'timeout', error: { kind: 'ai-timeout' } })
  })
})

describe('messages', () => {
  it('returns the text, stop reason and usage, and does nothing else with it', async () => {
    const { fetch } = mockFetch(
      json(200, { content: [{ type: 'text', text: 'Hello ' }, { type: 'text', text: 'there' }], stop_reason: 'end_turn', usage: { input_tokens: 9, output_tokens: 3 } }, { 'request-id': 'req_ok' }),
    )
    const outcome = await sendMessage(FAKE, { model: AI_MODELS.large, prompt: 'Hi', maxTokens: 64 }, { fetch, online: always })
    expect(outcome).toEqual({ ok: true, value: { text: 'Hello there', stopReason: 'end_turn', usage: { inputTokens: 9, outputTokens: 3 } }, requestId: 'req_ok' })
  })
})
