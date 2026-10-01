import { describe, expect, it } from 'vitest'
import { placeCard } from './placement'

const card = { width: 300, height: 160 }

describe('tour card placement', () => {
  it('goes above a toolbar at the bottom of a phone, kept inside the screen', () => {
    const p = placeCard({ top: 700, left: 20, width: 140, height: 48 }, card, { width: 360, height: 780 }, 12, 16)
    expect(p.side).toBe('above')
    expect(p.top).toBe(700 - 12 - 160)
    expect(p.left).toBe(16)
  })

  it('goes below a switch in a desktop top bar, centred on it', () => {
    const p = placeCard({ top: 4, left: 600, width: 140, height: 48 }, card, { width: 1280, height: 800 }, 12, 16)
    expect(p.side).toBe('below')
    expect(p.top).toBe(64)
    expect(p.left).toBe(600 + 70 - 150)
  })

  it('never runs off the right edge', () => {
    const p = placeCard({ top: 4, left: 1200, width: 60, height: 48 }, card, { width: 1280, height: 800 }, 12, 16)
    expect(p.left).toBe(1280 - 300 - 16)
  })

  it('stays at the margin when the card is wider than the screen', () => {
    const p = placeCard({ top: 700, left: 20, width: 140, height: 48 }, { width: 400, height: 160 }, { width: 360, height: 780 }, 12, 16)
    expect(p.left).toBe(16)
  })
})
