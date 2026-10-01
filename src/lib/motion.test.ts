import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { motionDuration, motionMs } from './motion'

describe('motion', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('is 0 when motion is reduced, the token otherwise', () => {
    expect(motionDuration(true, 400)).toBe(0)
    expect(motionDuration(false, 200)).toBe(200)
    expect(motionDuration(false, -5)).toBe(0)
  })

  it('reads the user setting', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce') }))
    expect(motionMs('--cl-duration-slow')).toBe(0)
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    expect(motionMs('--cl-duration-slow')).toBe(400)
  })

  it('the duration tokens are 0 under prefers-reduced-motion, and CSS transitions stop', () => {
    const tokens = readFileSync(join(import.meta.dirname, '../styles/tokens.css'), 'utf8')
    const block = tokens.match(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*:root\s*\{([^}]*)\}/)?.[1] ?? ''
    for (const name of ['fast', 'base', 'slow']) expect(block).toContain(`--cl-duration-${name}: 0ms`)
    const css = readFileSync(join(import.meta.dirname, '../index.css'), 'utf8')
    expect(css).toMatch(/prefers-reduced-motion: reduce[\s\S]*transition-duration: 0s !important/)
  })
})
