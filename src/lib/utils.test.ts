import { describe, expect, it } from 'vitest'
import { cn } from './utils'

describe('cn', () => {
  it('keeps the node font size alongside the node text colour', () => {
    expect(cn('text-node', 'text-node-text')).toBe('text-node text-node-text')
  })

  it('resolves conflicting utilities in favour of the last one', () => {
    expect(cn('bg-surface', 'bg-accent')).toBe('bg-accent')
    expect(cn('px-2', false, 'px-4')).toBe('px-4')
  })
})
