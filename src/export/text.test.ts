import { describe, expect, it } from 'vitest'
import { textBlockHeight, wrapText, type Measure } from './text'
import { minHeightForLabel } from '@/components/shapes/geometry'
import { cssFamily, resolveText } from '@/fonts/registry'

// Monospace stand-in: every character is 10px wide at any size.
const measure = (text: string) => text.length * 10

describe('wrapText', () => {
  it('keeps short labels on one line', () => {
    expect(wrapText('API', 100, 15, measure)).toEqual(['API'])
  })

  it('wraps at spaces only', () => {
    expect(wrapText('Payment gateway service', 100, 15, measure)).toEqual(['Payment', 'gateway', 'service'])
    expect(wrapText('a b c d e', 50, 15, measure)).toEqual(['a b c', 'd e'])
  })

  it('never splits a word that fits on its own line', () => {
    expect(wrapText('Customer', 80, 15, measure)).toEqual(['Customer'])
  })

  it('splits a single word only when it cannot fit at all', () => {
    expect(wrapText('Supercalifragilistic', 80, 15, measure)).toEqual(['Supercal', 'ifragili', 'stic'])
  })

  it('keeps explicit line breaks and collapses extra spaces', () => {
    expect(wrapText('One\nTwo   three', 200, 15, measure)).toEqual(['One', 'Two three'])
    expect(wrapText('', 100, 15, measure)).toEqual([''])
  })
})

describe('fitting follows the text style', () => {
  // A stand-in for the browser: monospace is wider, bold wider still, size scales width.
  const measure: Measure = (text, size, face) => text.length * size * (face?.family.includes('Mono') ? 0.6 : 0.5) * ((face?.weight ?? 500) >= 700 ? 1.1 : 1)
  const label = 'Orders service talks to the payment gateway and the ledger for every refund'
  const height = (style: Parameters<typeof resolveText>[0]) => {
    const t = resolveText(style, undefined, 15)
    return textBlockHeight(label, 132, t.size, 1.35, measure, { family: cssFamily(t.font), weight: t.weight, italic: t.italic })
  }

  it('changes with font, size and weight', () => {
    const base = height({})
    expect(height({ fontFamily: 'jetbrains-mono' })).toBeGreaterThan(base)
    expect(height({ fontSize: 24 })).toBeGreaterThan(base)
    expect(height({ fontWeight: 700, fontSize: 18 })).toBeGreaterThan(height({ fontSize: 18 }))
  })

  it('wraps at spaces, and the node grows to fit rather than clipping', () => {
    const t = resolveText({ fontFamily: 'jetbrains-mono', fontSize: 20 }, undefined, 15)
    const lines = wrapText(label, 132, t.size, measure, { family: cssFamily(t.font), weight: t.weight, italic: t.italic })
    expect(lines.every((l) => !l.startsWith(' ') && !l.endsWith(' '))).toBe(true)
    expect(lines.join(' ')).toBe(label)
    const content = height({ fontFamily: 'jetbrains-mono', fontSize: 20 }) + 2 * 8
    const needed = minHeightForLabel('rectangle', 160, content)
    expect(needed).toBeGreaterThan(80)
    expect(needed).toBeGreaterThanOrEqual(content)
  })
})
