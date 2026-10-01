import type { AiErrorKind, FriendlyError } from '@/errors/friendly'
import { aiError } from './messages'
import type { AiModel } from './models'
import { TEST_PROMPT } from './plan'
import { redactSecrets } from './redact'

/*
 * The one way Chalkline talks to Anthropic's API. Loaded on demand (never in
 * the initial bundle). Plain fetch, straight from the browser to
 * api.anthropic.com with the person's own key: no proxy, no SDK.
 *
 * - The key only ever goes in the x-api-key header: never the URL, the body,
 *   a log or an error (details are redacted).
 * - Cancel (AbortSignal) and a timeout; no automatic retries. The caller
 *   offers a Retry button.
 * - Every result is a typed outcome; failures carry a friendly error.
 */

export const API_BASE = 'https://api.anthropic.com/v1'
/** The current (and only) Messages API version. */
export const API_VERSION = '2023-06-01'
export const DEFAULT_TIMEOUT_MS = 60_000
export const TEST_TIMEOUT_MS = 20_000

export interface ApiRequest {
  url: string
  init: RequestInit & { headers: Record<string, string>; body: string }
}

/** The four headers every request needs. The last one opts in to calls from a browser page (CORS). */
export function apiHeaders(key: string): Record<string, string> {
  return {
    'content-type': 'application/json',
    'x-api-key': key,
    'anthropic-version': API_VERSION,
    'anthropic-dangerous-direct-browser-access': 'true',
  }
}

function request(path: string, key: string, body: unknown): ApiRequest {
  return {
    url: `${API_BASE}${path}`,
    init: {
      method: 'POST',
      headers: apiHeaders(key),
      body: JSON.stringify(body),
      // Nothing about this page goes with the request, and nothing is cached.
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
    },
  }
}

export interface MessageInput {
  model: AiModel
  /** Instructions for the model. */
  system?: string
  /** The person's request plus any diagram payload, as one user message. */
  prompt: string
  maxTokens: number
  /** Mark the system prompt cacheable: it's the same on every request of an action, so a retry soon after reads it from the cache. */
  cacheSystem?: boolean
  /** Structured output: the answer is JSON matching this schema (output_config.format). */
  outputSchema?: Record<string, unknown>
  /** How much effort (and thinking) the model spends; missing means the model's default. */
  effort?: 'low' | 'medium' | 'high'
}

/** POST /v1/messages: one user turn, no tools, thinking left at the model's default. */
export function buildMessagesRequest(key: string, input: MessageInput): ApiRequest {
  const system = input.system && (input.cacheSystem ? [{ type: 'text', text: input.system, cache_control: { type: 'ephemeral' } }] : input.system)
  const outputConfig = {
    ...(input.effort && { effort: input.effort }),
    ...(input.outputSchema && { format: { type: 'json_schema', schema: input.outputSchema } }),
  }
  return request('/messages', key, {
    model: input.model.id,
    max_tokens: input.maxTokens,
    ...(system && { system }),
    ...(Object.keys(outputConfig).length > 0 && { output_config: outputConfig }),
    messages: [{ role: 'user', content: input.prompt }],
  })
}

/** POST /v1/messages/count_tokens: free, and still checks the key and the model. */
export function buildCountTokensRequest(key: string, model: AiModel, prompt: string): ApiRequest {
  return request('/messages/count_tokens', key, { model: model.id, messages: [{ role: 'user', content: prompt }] })
}

/* ---------- Outcomes ---------- */

export type FailureReason =
  | 'invalid-key'
  | 'permission'
  | 'billing'
  | 'rate-limited'
  | 'spend-limit'
  | 'overloaded'
  | 'server'
  | 'timeout'
  | 'too-large'
  | 'model-unavailable'
  | 'bad-request'
  | 'offline'
  | 'blocked'
  | 'cancelled'
  | 'unexpected'
  /* Answers that arrived but can't be used (Generate diagram). */
  | 'malformed'
  | 'refused'
  | 'truncated'

export type Failure = {
  ok: false
  reason: FailureReason
  error: FriendlyError
  status?: number
  /** Seconds, from the retry-after header. */
  retryAfter?: number
}

export type Outcome<T> = { ok: true; value: T; requestId?: string } | Failure

const KIND: Record<FailureReason, AiErrorKind> = {
  'invalid-key': 'ai-invalid-key',
  permission: 'ai-permission',
  billing: 'ai-billing',
  'rate-limited': 'ai-rate-limited',
  'spend-limit': 'ai-spend-limit',
  overloaded: 'ai-overloaded',
  server: 'ai-server',
  timeout: 'ai-timeout',
  'too-large': 'ai-too-large',
  'model-unavailable': 'ai-model-unavailable',
  'bad-request': 'ai-bad-request',
  offline: 'ai-offline',
  blocked: 'ai-blocked',
  cancelled: 'ai-cancelled',
  unexpected: 'ai-unexpected',
  malformed: 'ai-malformed',
  refused: 'ai-refused',
  truncated: 'ai-truncated',
}

export function failure(reason: FailureReason, detail?: string, extra: { status?: number; retryAfter?: number } = {}): Failure {
  return { ok: false, reason, error: aiError(KIND[reason], detail, { wait: extra.retryAfter }), ...extra }
}

/** The API's error body: { type: 'error', error: { type, message, details? }, request_id }. */
interface ApiErrorBody {
  error?: { type?: string; message?: string; details?: { error_code?: string } }
  request_id?: string | null
}

/** retry-after in seconds; an HTTP date is turned into seconds from now. */
export function parseRetryAfter(value: string | null, now = Date.now()): number | undefined {
  if (!value) return undefined
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) return seconds
  const date = Date.parse(value)
  return Number.isNaN(date) ? undefined : Math.max(0, Math.round((date - now) / 1000))
}

/** Which failure an HTTP error status (and its body) means. */
export function reasonForStatus(status: number, body: ApiErrorBody | null): FailureReason {
  const type = body?.error?.type
  if (status === 401) return 'invalid-key'
  if (status === 402) return 'billing'
  if (status === 403) return 'permission'
  if (status === 404) return 'model-unavailable'
  if (status === 413 || type === 'request_too_large') return 'too-large'
  if (status === 429) return body?.error?.details?.error_code === 'enforced_spend_limit_reached' ? 'spend-limit' : 'rate-limited'
  if (status === 529 || type === 'overloaded_error') return 'overloaded'
  if (status === 504 || status === 408) return 'timeout'
  if (status >= 500) return 'server'
  return 'bad-request'
}

/** A failed response as a friendly failure, with the API's own words (redacted) in Details. */
export function mapHttpError(status: number, body: ApiErrorBody | null, headers: Pick<Headers, 'get'>): Failure {
  const reason = reasonForStatus(status, body)
  const retryAfter = reason === 'rate-limited' || reason === 'overloaded' ? parseRetryAfter(headers.get('retry-after')) : undefined
  const id = body?.request_id ?? headers.get('request-id')
  const detail = [`HTTP ${status}${body?.error?.type ? ` ${body.error.type}` : ''}`, body?.error?.message, id && `Request id: ${id}`].filter(Boolean).join('\n')
  return failure(reason, detail, { status, ...(retryAfter !== undefined && { retryAfter }) })
}

export interface SendOptions {
  /** Cancels the request (the Cancel button). */
  signal?: AbortSignal
  timeoutMs?: number
  fetch?: typeof fetch
  /** navigator.onLine; tells "offline" from "blocked" when fetch fails. */
  online?: () => boolean
}

const online = () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false)

/**
 * Sends one request. Never throws and never retries: every way it can end
 * is an outcome. A fetch that fails outright while online is reported as
 * blocked: the browser gives no more detail (CORS, ad blockers, firewalls
 * and DNS all look the same from a page).
 */
export async function send(req: ApiRequest, options: SendOptions = {}): Promise<Outcome<unknown>> {
  const { signal, timeoutMs = DEFAULT_TIMEOUT_MS, fetch: doFetch = globalThis.fetch.bind(globalThis), online: isOnline = online } = options
  if (signal?.aborted) return failure('cancelled')
  if (!isOnline()) return failure('offline')

  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  const stop = () => controller.abort()
  signal?.addEventListener('abort', stop)

  try {
    let response: Response
    try {
      response = await doFetch(req.url, { ...req.init, signal: controller.signal })
    } catch (error) {
      if (timedOut) return failure('timeout')
      if (signal?.aborted) return failure('cancelled')
      return failure(isOnline() ? 'blocked' : 'offline', redactSecrets(String((error as Error)?.message ?? error)))
    }

    let body: unknown = null
    try {
      body = await response.json()
    } catch (error) {
      if (timedOut) return failure('timeout')
      if (signal?.aborted) return failure('cancelled')
      if (response.ok) return failure('unexpected', `HTTP ${response.status}: the answer wasn’t JSON.`)
    }

    if (!response.ok) return mapHttpError(response.status, body as ApiErrorBody | null, response.headers)
    return { ok: true, value: body, requestId: response.headers.get('request-id') ?? undefined }
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', stop)
  }
}

/* ---------- Actions ---------- */

/** Checks a key with the cheapest call there is (count_tokens is free). Success means the key works for `model`. */
export async function testKey(key: string, model: AiModel, options: SendOptions = {}): Promise<Outcome<{ inputTokens: number }>> {
  const outcome = await send(buildCountTokensRequest(key, model, TEST_PROMPT), { timeoutMs: TEST_TIMEOUT_MS, ...options })
  if (!outcome.ok) return outcome
  const tokens = (outcome.value as { input_tokens?: unknown } | null)?.input_tokens
  if (typeof tokens !== 'number') return failure('unexpected', 'No input_tokens in the answer.')
  return { ok: true, value: { inputTokens: tokens }, requestId: outcome.requestId }
}

export interface MessageResult {
  text: string
  stopReason: string | null
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number }
}

/** One Messages call, for the AI actions in later releases. The answer is returned, never applied. */
export async function sendMessage(key: string, input: MessageInput, options: SendOptions = {}): Promise<Outcome<MessageResult>> {
  const outcome = await send(buildMessagesRequest(key, input), options)
  if (!outcome.ok) return outcome
  const body = outcome.value as {
    content?: { type?: string; text?: string }[]
    stop_reason?: string | null
    usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number }
  } | null
  if (!body || !Array.isArray(body.content)) return failure('unexpected', 'No content in the answer.')
  const text = body.content
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('')
  return {
    ok: true,
    value: {
      text,
      stopReason: body.stop_reason ?? null,
      usage: {
        inputTokens: body.usage?.input_tokens ?? 0,
        outputTokens: body.usage?.output_tokens ?? 0,
        cacheReadTokens: body.usage?.cache_read_input_tokens ?? 0,
      },
    },
    requestId: outcome.requestId,
  }
}
