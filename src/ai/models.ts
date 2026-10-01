/*
 * The Claude models AI features use: the one place to change them. Checked
 * against the Anthropic models overview on 1 Oct 2026.
 *
 * Claude Haiku 4.5 is listed for retirement "not sooner than 15 Oct 2026".
 * When it goes, requests return 404 and the key test says the model isn't
 * available: change `small` here (and the help topic).
 */

export interface AiModel {
  /** The exact API model id. */
  id: string
  /** Shown to people next to every AI action. */
  name: string
  /** What it's used for, in a few words. */
  use: string
}

export const AI_MODELS = {
  /** Fast and cheap: labels, summaries, annotation suggestions, and the key test. */
  small: { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', use: 'Labels, summaries and testing your key' },
  /** More capable: generating diagrams from text. */
  large: { id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5', use: 'Generating diagrams' },
} as const satisfies Record<string, AiModel>

export type ModelRole = keyof typeof AI_MODELS
