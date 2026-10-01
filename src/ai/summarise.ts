import { fileNameFor } from '@/persistence/serialize'
import { failure, sendMessage, type Outcome, type SendOptions } from './client'
import { AI_MODELS } from './models'
import type { SummaryRequest } from './summaryPrompt'
import type { Usage } from './usage'

/*
 * Summarise, end to end: send the prepared request to the small model and
 * return the Markdown it wrote. Read-only: nothing here touches the diagram.
 * Loaded on demand with the client.
 */

/** A long document from a big diagram can take a while. */
export const SUMMARY_TIMEOUT_MS = 120_000

export interface Summary {
  markdown: string
  /** The answer reached its length limit, so it ends early. */
  cutOff: boolean
  usage: Usage | null
}

export async function summariseDiagram(key: string, request: SummaryRequest, options: SendOptions = {}): Promise<Outcome<Summary>> {
  // No effort setting: Claude Haiku 4.5 doesn't take one.
  const outcome = await sendMessage(key, { model: AI_MODELS.small, system: request.system, prompt: request.prompt, maxTokens: request.maxTokens }, { timeoutMs: SUMMARY_TIMEOUT_MS, ...options })
  if (!outcome.ok) return outcome
  const { text, stopReason, usage } = outcome.value
  if (stopReason === 'refusal') return failure('refused', 'stop_reason: refusal', { usage })
  const markdown = text.trim()
  if (!markdown) return failure('unexpected', 'The answer had no text.', { usage })
  return { ok: true, value: { markdown, cutOff: stopReason === 'max_tokens', usage }, requestId: outcome.requestId }
}

/** "web-architecture-summary.md": from the diagram's title, the same way as the other downloads. */
export const summaryFileName = (title: string) => fileNameFor(title, 'md').replace(/\.md$/, '-summary.md')
