/*
 * Keeps the API key out of anything shown or logged. Every error detail goes
 * through redactSecrets (friendlyError calls it), so a key echoed back in an
 * error, a header dump or a stack trace is replaced before anyone sees it.
 *
 * Two layers: the exact keys this visit has seen (registered by the key
 * store), and the shape of an Anthropic key, for one this visit never saw.
 * Small and dependency-free, because friendly.ts is in the initial bundle.
 */

export const REDACTED = '[API key removed]'

/** Exact secrets seen this visit. Kept after a key is removed, so late errors are still cleaned. */
const known = new Set<string>()

/** Shorter strings are too likely to match ordinary text. */
const MIN_SECRET = 8

/** Anthropic keys (sk-ant-api03-…, sk-ant-admin01-…); anything after the prefix is hidden. */
const KEY_SHAPE = /sk-ant-(?:[\w-])+/g

/** "x-api-key: value", "x-api-key": "value", x-api-key=value. */
const HEADER = /(x-api-key["']?\s*[:=]\s*["']?)[^\s"',;}]+/gi

export function registerSecret(secret: string) {
  if (secret.length >= MIN_SECRET) known.add(secret)
}

/** Text with every known key, key-shaped string and x-api-key value replaced. */
export function redactSecrets(text: string): string {
  let out = text
  for (const secret of known) out = out.split(secret).join(REDACTED)
  return out.replace(KEY_SHAPE, REDACTED).replace(HEADER, `$1${REDACTED}`)
}

/** True if the text holds a known key or anything shaped like one. */
export function containsSecret(text: string): boolean {
  return redactSecrets(text) !== text
}

/** For tests only: forget the registered secrets. */
export function resetSecretsForTests() {
  known.clear()
}
