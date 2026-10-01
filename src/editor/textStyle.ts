import { BOLD_WEIGHT, canBold, canItalic, getFont, type TextStyleFields } from '@/fonts/registry'
import type { TextDefaults } from '@/schema/diagram'
import { MIXED, shared, type Shared } from './fields'

/*
 * The text controls' view of one or many selected labels: shared values or
 * "mixed", which faces the chosen fonts really have, and the patch each
 * control applies (to every selected item, as one step).
 */

export type Toggle = boolean | typeof MIXED
export type FaceAvailability = 'all' | 'some' | 'none'

export interface TextControlsState {
  fontFamily: Shared<string>
  fontSize: Shared<number>
  bold: Toggle
  italic: Toggle
  underline: Toggle
  strike: Toggle
  textAlign: Shared<NonNullable<TextStyleFields['textAlign']>>
  /** Whether the fonts in use have a bold / an italic face. */
  available: { bold: FaceAvailability; italic: FaceAvailability }
}

const toggle = <T,>(items: T[], on: (item: T) => boolean): Toggle => {
  const value = shared(items, on)
  return value === MIXED ? MIXED : Boolean(value)
}

function availability<T>(items: T[], has: (item: T) => boolean): FaceAvailability {
  const count = items.filter(has).length
  return count === items.length ? 'all' : count === 0 ? 'none' : 'some'
}

export function textControlsState(styles: TextStyleFields[], defaults: TextDefaults | undefined): TextControlsState {
  const fontOf = (s: TextStyleFields) => getFont(s.fontFamily ?? defaults?.fontFamily)
  return {
    fontFamily: shared(styles, (s) => s.fontFamily),
    fontSize: shared(styles, (s) => s.fontSize),
    bold: toggle(styles, (s) => s.fontWeight === BOLD_WEIGHT),
    italic: toggle(styles, (s) => s.fontStyle === 'italic'),
    underline: toggle(styles, (s) => s.textDecoration === 'underline'),
    strike: toggle(styles, (s) => s.textDecoration === 'line-through'),
    textAlign: shared(styles, (s) => s.textAlign),
    available: { bold: availability(styles, (s) => canBold(fontOf(s))), italic: availability(styles, (s) => canItalic(fontOf(s))) },
  }
}

export type ToggleKind = 'bold' | 'italic' | 'underline' | 'strike'

/**
 * The patch for pressing a toggle: on for all if it was off or mixed, off for
 * all if it was on. "Off" removes the field (the default look). Underline and
 * strikethrough share one field, so turning one on turns the other off.
 */
export function togglePatch(kind: ToggleKind, current: Toggle): Partial<Record<keyof TextStyleFields, unknown>> {
  const on = current !== true
  switch (kind) {
    case 'bold':
      return { fontWeight: on ? BOLD_WEIGHT : undefined }
    case 'italic':
      return { fontStyle: on ? 'italic' : undefined }
    case 'underline':
      return { textDecoration: on ? 'underline' : undefined }
    case 'strike':
      return { textDecoration: on ? 'line-through' : undefined }
  }
}
