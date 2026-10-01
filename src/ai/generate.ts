import type { ElkLike } from '@/layout/computeLayout'
import { failure, sendMessage, type Outcome, type SendOptions } from './client'
import { validateGenerated, type GeneratedDiagram } from './generated'
import { layoutGenerated, type LaidOut, type LayoutOptions } from './generatedLayout'
import { generateRequest } from './generatePrompt'
import { AI_MODELS } from './models'
import type { Usage } from './usage'

/*
 * Generate diagram, end to end: send the description, check the answer,
 * lay it out. Returns a preview; it never touches the diagram (adding is a
 * separate store action the person chooses). Loaded on demand with the client.
 */

/** Generating takes longer than other requests: the answer can be a few thousand tokens. */
export const GENERATE_TIMEOUT_MS = 180_000

/** Thinking effort: enough to plan a sensible diagram, without the cost and wait of the default. */
export const GENERATE_EFFORT = 'medium' as const

export interface Generation extends LaidOut {
  generated: GeneratedDiagram
  /** What was fixed or left out, in plain words. */
  warnings: string[]
  /** Tokens the API reported, or null if it didn't. */
  usage: Usage | null
}

export interface GenerateOptions extends SendOptions, LayoutOptions {
  elk: ElkLike
}

export async function generateDiagram(key: string, description: string, includeNotes: boolean, options: GenerateOptions): Promise<Outcome<Generation>> {
  const { elk, grid, arrowhead, ...send } = options
  const req = generateRequest(description, includeNotes)
  const outcome = await sendMessage(
    key,
    { model: AI_MODELS.large, system: req.system, prompt: req.prompt, maxTokens: req.maxTokens, cacheSystem: true, outputSchema: req.schema, effort: GENERATE_EFFORT },
    { timeoutMs: GENERATE_TIMEOUT_MS, ...send },
  )
  if (!outcome.ok) return outcome
  const { text, stopReason, usage } = outcome.value
  // Answers that can't be used were still billed: their usage goes with the failure.
  if (stopReason === 'refusal') return failure('refused', 'stop_reason: refusal', { usage })
  if (stopReason === 'max_tokens') return failure('truncated', 'stop_reason: max_tokens', { usage })

  const checked = validateGenerated(text, { includeNotes })
  if (!checked.ok) return failure('malformed', checked.detail, { usage })

  const laid = await layoutGenerated(checked.diagram, elk, { grid, arrowhead })
  if (!laid.ok) return failure('unexpected', laid.message, { usage })
  return { ok: true, value: { ...laid.value, generated: checked.diagram, warnings: checked.warnings, usage }, requestId: outcome.requestId }
}
