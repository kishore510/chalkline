import { failure, sendMessage, type Failure, type Outcome, type SendOptions } from './client'
import { aiError } from './messages'
import { validateReview, type ReviewFinding } from './reviewFindings'
import type { ReviewInput } from './reviewPrompt'
import type { Usage } from './usage'

/*
 * Review, end to end: send the prepared request, check the answer, and
 * return findings to show. Read-only: nothing here touches the diagram.
 * Loaded on demand with the client.
 */

export const REVIEW_TIMEOUT_MS = 120_000
/** Deeper review thinks first. */
export const DEEP_REVIEW_TIMEOUT_MS = 180_000
/** Deeper review's thinking effort: enough to weigh the diagram, without the cost and wait of the default. */
export const DEEP_REVIEW_EFFORT = 'medium' as const

export interface AiReview {
  findings: ReviewFinding[]
  /** The model's remark on the review as a whole, or ''. */
  note: string
  /** What was fixed or left out, in plain words. */
  warnings: string[]
  usage: Usage | null
}

/** An answer that arrived but couldn't be used: billed, so its usage goes with it. */
const unreadable = (detail: string, usage: Usage | null): Failure => ({ ...failure('malformed', detail, { usage }), error: aiError('ai-review-malformed', detail) })

export async function reviewDiagram(key: string, input: ReviewInput, options: SendOptions = {}): Promise<Outcome<AiReview>> {
  const { request, options: chosen } = input
  // Claude Haiku 4.5 takes no effort setting; the larger model does.
  const outcome = await sendMessage(
    key,
    { model: request.model, system: request.system, prompt: request.prompt, maxTokens: request.maxTokens, outputSchema: request.schema, ...(chosen.deeper && { effort: DEEP_REVIEW_EFFORT }) },
    { timeoutMs: chosen.deeper ? DEEP_REVIEW_TIMEOUT_MS : REVIEW_TIMEOUT_MS, ...options },
  )
  if (!outcome.ok) return outcome
  const { text, stopReason, usage } = outcome.value
  if (stopReason === 'refusal') return failure('refused', 'stop_reason: refusal', { usage })
  if (stopReason === 'max_tokens') return unreadable('stop_reason: max_tokens (the answer was cut off)', usage)
  const checked = validateReview(text, input.sentIds, chosen.focus)
  if (!checked.ok) return unreadable(checked.detail, usage)
  return { ok: true, value: { findings: checked.findings, note: checked.note, warnings: checked.warnings, usage }, requestId: outcome.requestId }
}
