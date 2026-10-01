import { describe, expect, it } from 'vitest'
import { MIXED } from './fields'
import { textControlsState, togglePatch } from './textStyle'

describe('text controls state', () => {
  it('shows shared values for one or many alike labels', () => {
    const s = textControlsState([{ fontFamily: 'nunito', fontWeight: 700, textAlign: 'left' }, { fontFamily: 'nunito', fontWeight: 700, textAlign: 'left' }], undefined)
    expect(s).toMatchObject({ fontFamily: 'nunito', fontSize: undefined, bold: true, italic: false, underline: false, strike: false, textAlign: 'left' })
  })

  it('shows mixed where values differ', () => {
    const s = textControlsState(
      [
        { fontFamily: 'nunito', fontWeight: 700, textDecoration: 'underline', fontSize: 12 },
        { fontFamily: 'caveat', textDecoration: 'line-through', fontSize: 12 },
      ],
      undefined,
    )
    expect(s.fontFamily).toBe(MIXED)
    expect(s.bold).toBe(MIXED)
    expect(s.underline).toBe(MIXED)
    expect(s.strike).toBe(MIXED)
    expect(s.italic).toBe(false)
    expect(s.fontSize).toBe(12)
    expect(s.textAlign).toBeUndefined()
  })

  it('reports which selected fonts have italic and bold, using the diagram default for unset fonts', () => {
    expect(textControlsState([{ fontFamily: 'caveat' }], undefined).available).toEqual({ bold: 'all', italic: 'none' })
    expect(textControlsState([{ fontFamily: 'caveat' }, {}], undefined).available.italic).toBe('some')
    expect(textControlsState([{}], { fontFamily: 'caveat' }).available.italic).toBe('none')
    expect(textControlsState([{ fontFamily: 'some-future-font' }], undefined).available.italic).toBe('all')
  })
})

describe('togglePatch', () => {
  it('turns a toggle on for all when off or mixed, and off for all when on', () => {
    expect(togglePatch('bold', false)).toEqual({ fontWeight: 700 })
    expect(togglePatch('bold', MIXED)).toEqual({ fontWeight: 700 })
    expect(togglePatch('bold', true)).toEqual({ fontWeight: undefined })
    expect(togglePatch('italic', false)).toEqual({ fontStyle: 'italic' })
  })

  it('underline and strikethrough share one field', () => {
    expect(togglePatch('underline', false)).toEqual({ textDecoration: 'underline' })
    expect(togglePatch('strike', false)).toEqual({ textDecoration: 'line-through' })
    expect(togglePatch('strike', true)).toEqual({ textDecoration: undefined })
  })
})
