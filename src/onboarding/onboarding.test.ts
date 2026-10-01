import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { foundSavedWork, shouldWelcome, type StartupLoad } from './firstRun'
import { tourSteps } from './tourSteps'

describe('first-run welcome', () => {
  it('shows only for a first visit with nothing saved', () => {
    expect(shouldWelcome(false, 'none', true)).toBe(true)
  })

  it.each<StartupLoad>(['ok', 'corrupt', 'newer', 'skipped'])('never shows when startup found %s', (startup) => {
    expect(shouldWelcome(false, startup, true)).toBe(false)
  })

  it('never shows once done, or when the diagram already has content', () => {
    expect(shouldWelcome(true, 'none', true)).toBe(false)
    expect(shouldWelcome(false, 'none', false)).toBe(false)
  })

  it('treats any saved work, even unreadable, as a returning visitor', () => {
    expect(foundSavedWork('ok')).toBe(true)
    expect(foundSavedWork('corrupt')).toBe(true)
    expect(foundSavedWork('newer')).toBe(true)
    expect(foundSavedWork('none')).toBe(false)
    expect(foundSavedWork('skipped')).toBe(false)
  })
})

describe('tour steps', () => {
  const quickStart = readFileSync(join(import.meta.dirname, '..', 'help', 'topics', 'quick-start.md'), 'utf8')

  it('come from the Quick start help topic: the switch, then each mode', () => {
    const steps = tourSteps(quickStart)
    expect(steps.map((s) => s.target)).toEqual(['modes', 'select', 'pan', 'link'])
    expect(steps.map((s) => s.shortcut)).toEqual([undefined, 'V', 'H', 'L'])
    expect(steps[0]!.body).toMatch(/mode switch/i)
    expect(steps[1]!.title).toBe('Select mode')
    expect(steps[1]!.body).toMatch(/^Tap to select/)
    expect(steps[3]!.body).toMatch(/source shape, then a target/)
    for (const s of steps) expect(s.body).not.toMatch(/[*`]/)
  })

  it('returns no steps if the help section changes shape, rather than a broken tour', () => {
    expect(tourSteps('---\ntitle: x\norder: 1\nkeywords: a\n---\n## Something else\n\nText.')).toEqual([])
    expect(tourSteps('## The three modes\n\nIntro.\n\n- **Select** (`V`): one.')).toEqual([])
  })
})
