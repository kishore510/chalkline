/*
 * Where the tour's card goes relative to the part of the screen it points at:
 * on the side with more room (above a toolbar at the bottom of a phone, below
 * one in a desktop top bar), centred on it, and kept inside the viewport.
 * Pure, so it can be tested without a browser.
 */

export interface Box {
  top: number
  left: number
  width: number
  height: number
}

export interface Placement {
  top: number
  left: number
  side: 'above' | 'below'
}

export function placeCard(target: Box, card: { width: number; height: number }, viewport: { width: number; height: number }, gap: number, margin: number): Placement {
  const above = target.top
  const below = viewport.height - (target.top + target.height)
  const side = above > below ? 'above' : 'below'
  const rawTop = side === 'above' ? target.top - gap - card.height : target.top + target.height + gap
  const rawLeft = target.left + target.width / 2 - card.width / 2
  const clamp = (value: number, max: number) => Math.max(margin, Math.min(value, Math.max(margin, max - margin)))
  return { side, top: clamp(rawTop, viewport.height - card.height), left: clamp(rawLeft, viewport.width - card.width) }
}
