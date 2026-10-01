/*
 * The size of what will be sent, shown before sending. Tokens are an
 * estimate: about three characters per token, on the high side for English
 * and JSON with the current tokenizer, so the real count is usually lower.
 * No network call: counting with the API would send the content before the
 * person has agreed to send it.
 */

export const CHARS_PER_TOKEN = 3

export interface SizeEstimate {
  characters: number
  /** Approximate. */
  tokens: number
}

/** Deterministic and never smaller for longer text. */
export function estimateSize(text: string): SizeEstimate {
  const characters = [...text].length
  return { characters, tokens: Math.ceil(characters / CHARS_PER_TOKEN) }
}

const number = (n: number) => n.toLocaleString('en-GB')

/** "1,234 characters, about 412 tokens (an estimate)" */
export const describeSize = (size: SizeEstimate) =>
  `${number(size.characters)} character${size.characters === 1 ? '' : 's'}, about ${number(size.tokens)} token${size.tokens === 1 ? '' : 's'} (an estimate)`
