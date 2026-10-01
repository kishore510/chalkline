import { describe, expect, it } from 'vitest'
import { dashArray, edgeAppearance, nodeAppearance } from './appearance'

describe('nodeAppearance', () => {
  it('leaves unset properties to the theme', () => {
    const { text, ...rest } = nodeAppearance({})
    expect(rest).toEqual({ fill: undefined, stroke: undefined, strokeWidth: undefined, textColour: undefined, fontSize: undefined })
    // The app's label look: Inter, medium, upright, centred, nothing synthesised.
    expect(text).toEqual({ fontFamily: expect.stringContaining("'Inter Variable'"), fontWeight: 500, fontStyle: 'normal', textDecorationLine: undefined, textAlign: 'center', fontSynthesis: 'none' })
  })

  it('applies text styling and the diagram defaults; the label’s own values win', () => {
    const a = nodeAppearance({ fontFamily: 'caveat', fontStyle: 'italic', fontWeight: 700, textDecoration: 'line-through', textAlign: 'right' }, { fontFamily: 'nunito', fontSize: 18 })
    expect(a.fontSize).toBe(18)
    expect(a.text).toMatchObject({ fontFamily: expect.stringContaining("'Caveat Variable'"), fontWeight: 700, fontStyle: 'normal', textDecorationLine: 'line-through', textAlign: 'right' })
    expect(nodeAppearance({}, { fontFamily: 'nunito' }).text?.fontFamily).toContain("'Nunito Variable'")
    expect(nodeAppearance({ fontSize: 12 }, { fontSize: 18 }).fontSize).toBe(12)
  })

  it('resolves colours and passes numbers through', () => {
    expect(nodeAppearance({ fill: 'token:swatch-blue-soft', stroke: '#AA0000', strokeWidth: 0, textColour: 'token:text', fontSize: 20 })).toMatchObject({
      fill: 'var(--cl-swatch-blue-soft, var(--cl-node-fill))',
      stroke: '#aa0000',
      strokeWidth: 0,
      textColour: 'var(--cl-text, var(--cl-node-text))',
      fontSize: 20,
    })
  })
})

describe('edgeAppearance', () => {
  it('uses defaults', () => {
    expect(edgeAppearance({}, false, 1.5)).toEqual({ colour: 'var(--cl-edge)', width: 1.5, dashArray: undefined })
  })

  it('scales dashes with width, with a minimum', () => {
    expect(dashArray(1)).toBe('4 3')
    expect(dashArray(3)).toBe('12 9')
    expect(edgeAppearance({ dashed: true, width: 2 }, false, 1.5).dashArray).toBe('8 6')
  })
})
