import { describe, expect, it } from 'vitest'
import { parseCssNumber, readToken } from './cssVar'

describe('parseCssNumber', () => {
  it.each([
    ['20px', 20],
    [' 1.5px ', 1.5],
    ['200ms', 200],
    ['12', 12],
  ])('parses %j', (input, expected) => {
    expect(parseCssNumber(input, -1)).toBe(expected)
  })

  it.each(['', 'auto', '1rem', 'calc(1px + 2px)'])('falls back for %j', (input) => {
    expect(parseCssNumber(input, 7)).toBe(7)
  })

  it('falls back without a document', () => {
    expect(readToken('--cl-grid-gap', 20, null)).toBe(20)
  })
})
