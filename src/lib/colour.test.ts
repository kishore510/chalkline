import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ColourSchema } from '@/schema/diagram'
import { COLOUR_PRESETS, normaliseHex, presetToken, resolveColour } from './colour'

const tokens = readFileSync(join(import.meta.dirname, '..', 'styles', 'tokens.css'), 'utf8')

describe('resolveColour', () => {
  it('passes hex through, lower-cased', () => {
    expect(resolveColour('#1F6AA5', 'x')).toBe('#1f6aa5')
  })

  it('turns tokens into CSS variables with the fallback', () => {
    expect(resolveColour('token:accent', 'var(--cl-edge)')).toBe('var(--cl-accent, var(--cl-edge))')
  })

  it.each([undefined, '', 'red', '#fff', 'token:', 'token:Bad'])('falls back for %j', (value) => {
    expect(resolveColour(value, 'FALLBACK')).toBe('FALLBACK')
  })
})

describe('presets', () => {
  it.each(COLOUR_PRESETS)('%s tokens are valid schema colours defined in both themes', (preset) => {
    for (const variant of ['soft', 'strong'] as const) {
      const token = presetToken(preset, variant)
      expect(ColourSchema.safeParse(token).success).toBe(true)
      const name = token.replace('token:', '--cl-')
      expect(tokens.match(new RegExp(`${name}:`, 'g'))).toHaveLength(2)
    }
  })
})

describe('normaliseHex', () => {
  it('accepts colour-input values only', () => {
    expect(normaliseHex('#AABBCC')).toBe('#aabbcc')
    expect(normaliseHex('rgb(0,0,0)')).toBeNull()
  })
})
