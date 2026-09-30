/**
 * Reads a numeric design token at runtime, for the few places a library wants
 * a number (grid size, animation duration) rather than a CSS value.
 * Accepts px and ms values; returns `fallback` if the token is missing.
 */
export function parseCssNumber(value: string, fallback: number): number {
  const match = value.trim().match(/^(-?\d+(?:\.\d+)?)(px|ms)?$/)
  return match ? Number(match[1]) : fallback
}

export function readToken(name: `--cl-${string}`, fallback: number, root: Element | null = globalThis.document?.documentElement ?? null): number {
  if (!root) return fallback
  return parseCssNumber(getComputedStyle(root).getPropertyValue(name), fallback)
}
