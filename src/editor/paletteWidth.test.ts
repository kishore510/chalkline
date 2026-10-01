import { describe, expect, it } from 'vitest'
import { clampPaletteWidth, maxPaletteWidth, shouldCollapse } from './paletteWidth'

describe('palette width', () => {
  it('clamps to the minimum and maximum', () => {
    expect(clampPaletteWidth(100, 200, 480)).toBe(200)
    expect(clampPaletteWidth(900, 200, 480)).toBe(480)
    expect(clampPaletteWidth(300.4, 200, 480)).toBe(300)
  })

  it('never takes more than 40% of the window, nor goes under the minimum', () => {
    expect(maxPaletteWidth(200, 480, 1920)).toBe(480)
    expect(maxPaletteWidth(200, 480, 1024)).toBe(409)
    expect(maxPaletteWidth(200, 480, 400)).toBe(200)
  })

  it('collapses when released well below the minimum', () => {
    expect(shouldCollapse(180, 200)).toBe(false)
    expect(shouldCollapse(120, 200)).toBe(true)
  })
})
