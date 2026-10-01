import { MEDIA } from '@/styles/breakpoints'
import { readToken } from './cssVar'

/*
 * The one place animation lengths come from. With "reduce motion" on, every
 * duration is 0: viewport moves (centre, fit, reveal, zoom) jump, and the
 * duration tokens are 0 too (tokens.css), so CSS transitions stop as well.
 */

export type MotionToken = '--cl-duration-fast' | '--cl-duration-base' | '--cl-duration-slow'

const FALLBACK: Record<MotionToken, number> = { '--cl-duration-fast': 120, '--cl-duration-base': 200, '--cl-duration-slow': 400 }

/** The duration to use: 0 when motion is reduced, otherwise the token's value. */
export function motionDuration(reduced: boolean, ms: number): number {
  return reduced ? 0 : Math.max(0, ms)
}

export function prefersReducedMotion(): boolean {
  return Boolean(globalThis.matchMedia?.(MEDIA.reducedMotion).matches)
}

/** Milliseconds for an animation of this length, honouring the user's motion setting. */
export function motionMs(token: MotionToken = '--cl-duration-base'): number {
  return motionDuration(prefersReducedMotion(), readToken(token, FALLBACK[token]))
}
