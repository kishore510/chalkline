import { create } from 'zustand'
import type { AiModel } from './models'

/*
 * Token counts the API reports for each request, shown after every AI action
 * with a running total for this visit. View state only: never saved, gone on
 * reload. No prices: only the counts Anthropic sent back. If an answer has no
 * usage (or it can't be read), nothing is shown rather than a guess.
 *
 * The API's usage object: input_tokens (input not read from or written to
 * the cache), cache_read_input_tokens, cache_creation_input_tokens and
 * output_tokens. All the input together is what the request read.
 */

export interface Usage {
  /** input_tokens: input outside the cache. */
  inputTokens: number
  outputTokens: number
  /** cache_read_input_tokens (0 when absent). */
  cacheReadTokens: number
  /** cache_creation_input_tokens (0 when absent). */
  cacheWriteTokens: number
}

const count = (value: unknown): number | undefined => (typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined)

/** The answer's usage, or null when it's missing or input_tokens / output_tokens aren't whole numbers. */
export function parseUsage(raw: unknown): Usage | null {
  if (!raw || typeof raw !== 'object') return null
  const u = raw as Record<string, unknown>
  const inputTokens = count(u.input_tokens)
  const outputTokens = count(u.output_tokens)
  if (inputTokens === undefined || outputTokens === undefined) return null
  return { inputTokens, outputTokens, cacheReadTokens: count(u.cache_read_input_tokens) ?? 0, cacheWriteTokens: count(u.cache_creation_input_tokens) ?? 0 }
}

/** Everything the request read: uncached, cached and newly cached input. */
export const totalInput = (u: Usage) => u.inputTokens + u.cacheReadTokens + u.cacheWriteTokens

export interface UsageRecord {
  model: AiModel
  usage: Usage
}

export interface SessionTotal {
  requests: number
  inputTokens: number
  outputTokens: number
}

interface UsageState {
  last: UsageRecord | null
  total: SessionTotal
  record: (model: AiModel, usage: Usage | null | undefined) => void
  /** For tests. */
  reset: () => void
}

const EMPTY: SessionTotal = { requests: 0, inputTokens: 0, outputTokens: 0 }

export const useUsageStore = create<UsageState>()((set) => ({
  last: null,
  total: EMPTY,
  record(model, usage) {
    // No usage reported: say nothing, and don't let an older line stand for this request.
    if (!usage) return set({ last: null })
    set((s) => ({
      last: { model, usage },
      total: { requests: s.total.requests + 1, inputTokens: s.total.inputTokens + totalInput(usage), outputTokens: s.total.outputTokens + usage.outputTokens },
    }))
  },
  reset: () => set({ last: null, total: EMPTY }),
}))

const n = (value: number) => value.toLocaleString('en-GB')
const tokens = (value: number, kind: string) => `${n(value)} ${kind} token${value === 1 ? '' : 's'}`

/** "Claude Haiku 4.5: 1,234 input tokens (1,000 from the cache), 210 output tokens." */
export function describeUsage({ model, usage }: UsageRecord): string {
  const cached = usage.cacheReadTokens ? ` (${n(usage.cacheReadTokens)} from the cache)` : ''
  return `${model.name}: ${tokens(totalInput(usage), 'input')}${cached}, ${tokens(usage.outputTokens, 'output')}.`
}

/** "This visit: 2 requests, 3,000 input tokens, 500 output tokens." */
export function describeTotal(total: SessionTotal): string {
  return `This visit: ${n(total.requests)} request${total.requests === 1 ? '' : 's'}, ${tokens(total.inputTokens, 'input')}, ${tokens(total.outputTokens, 'output')}.`
}
