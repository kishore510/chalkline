import { describe, expect, it } from 'vitest'
import { dashArray, edgeAppearance, nodeAppearance } from './appearance'

describe('nodeAppearance', () => {
  it('leaves unset properties to the theme', () => {
    expect(nodeAppearance({})).toEqual({ fill: undefined, stroke: undefined, strokeWidth: undefined, textColour: undefined, fontSize: undefined })
  })

  it('resolves colours and passes numbers through', () => {
    expect(nodeAppearance({ fill: 'token:swatch-blue-soft', stroke: '#AA0000', strokeWidth: 0, textColour: 'token:text', fontSize: 20 })).toEqual({
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
