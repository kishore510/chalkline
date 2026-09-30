import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BREAKPOINTS } from './breakpoints'

const tokens = readFileSync(join(import.meta.dirname, 'tokens.css'), 'utf8')

describe('breakpoints', () => {
  it.each(Object.entries(BREAKPOINTS))('%s matches tokens.css', (name, value) => {
    expect(tokens).toMatch(new RegExp(`--breakpoint-${name}:\\s*${value.replace('.', '\\.')};`))
  })
})
