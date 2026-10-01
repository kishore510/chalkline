import { describeSize, estimateSize, type SizeEstimate } from './estimate'
import { AI_MODELS, type AiModel } from './models'
import type { BuiltPayload } from './payload'

/*
 * What the confirmation step shows before anything is sent: the action, the
 * model, what is included and how big it is. Built before sending, from the
 * exact text that will be sent.
 */

export interface SendPlan {
  /** The button that started it, e.g. "Test key". */
  action: string
  model: AiModel
  /** What's included, one line each. */
  includes: string[]
  size: SizeEstimate
}

/** The key test's message: one word, nothing from the diagram. */
export const TEST_PROMPT = 'Hi'

export function testPlan(): SendPlan {
  return {
    action: 'Test key',
    model: AI_MODELS.small,
    includes: ['A one-word test message (“Hi”).', 'Nothing from your diagram.'],
    size: estimateSize(TEST_PROMPT),
  }
}

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** For diagram actions (later releases): counts from the payload, size from everything sent. */
export function diagramPlan(action: string, model: AiModel, built: BuiltPayload, instructions = ''): SendPlan {
  const { nodes, edges, groups, notes, notesLeftOut } = built.counts
  const parts = [count(nodes, 'shape'), count(edges, 'connector'), ...(groups ? [count(groups, 'group')] : [])]
  const includes = [`${parts.join(', ')}: ids, labels and shape types.`]
  includes.push(notes ? `${count(notes, 'note')}.` : notesLeftOut ? `No notes (${count(notesLeftOut, 'note')} left out).` : 'No notes.')
  includes.push('No colours, styling, positions or images.')
  return { action, model, includes, size: estimateSize(instructions + built.json) }
}

export const sizeText = (plan: SendPlan) => describeSize(plan.size)
