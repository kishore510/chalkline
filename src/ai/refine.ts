import type { ElkLike } from '@/layout/computeLayout'
import type { EdgeStyle } from '@/schema/diagram'
import { failure, sendMessage, type Outcome, type SendOptions } from './client'
import { validateRefine } from './refineContract'
import { layoutRefinement, type RefineLaidOut } from './refineLayout'
import type { RefineInput } from './refinePrompt'
import type { Usage } from './usage'

/*
 * Refine with AI, end to end: send the prepared request (captured at the
 * check step) to the large model, check the answer against the refs that
 * were sent, and lay out the new shapes. Returns a preview or "nothing to
 * add"; it never touches the diagram (adding is one separate store action).
 * Loaded on demand with the client.
 */

/** Like generating: the answer can be a few thousand tokens, after some thinking. */
export const REFINE_TIMEOUT_MS = 180_000
export const REFINE_EFFORT = 'medium' as const

export type Refinement =
  | { kind: 'add'; laid: RefineLaidOut; warnings: string[]; reason: string; usage: Usage | null }
  | { kind: 'nothing'; warnings: string[]; reason: string; usage: Usage | null }

export interface RefineOptions extends SendOptions {
  elk: ElkLike
  grid: number
  arrowhead: NonNullable<EdgeStyle['endArrow']>
}

export async function refineDiagram(key: string, input: RefineInput, options: RefineOptions): Promise<Outcome<Refinement>> {
  const { elk, grid, arrowhead, ...send } = options
  const { request } = input
  const outcome = await sendMessage(
    key,
    { model: request.model, system: request.system, prompt: request.prompt, maxTokens: request.maxTokens, cacheSystem: true, outputSchema: request.schema, effort: REFINE_EFFORT },
    { timeoutMs: REFINE_TIMEOUT_MS, ...send },
  )
  if (!outcome.ok) return outcome
  const { text, stopReason, usage } = outcome.value
  if (stopReason === 'refusal') return failure('refused', 'stop_reason: refusal', { usage })
  if (stopReason === 'max_tokens') return failure('truncated', 'stop_reason: max_tokens', { usage })

  const checked = validateRefine(text, { includeNotes: input.includeNotes, existing: new Set(input.refs.keys()) })
  if (!checked.ok) return failure('malformed', checked.detail, { usage })
  if (checked.kind === 'nothing') return { ok: true, value: { kind: 'nothing', warnings: checked.warnings, reason: checked.reason, usage }, requestId: outcome.requestId }

  const laid = await layoutRefinement(checked.diagram, input.refs, elk, { grid, arrowhead })
  if (!laid.ok) return failure('unexpected', laid.message, { usage })
  return { ok: true, value: { kind: 'add', laid: laid.value, warnings: checked.warnings, reason: checked.reason, usage }, requestId: outcome.requestId }
}
