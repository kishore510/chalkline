import { describe, expect, it } from 'vitest'
import { wrapText } from './text'

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
