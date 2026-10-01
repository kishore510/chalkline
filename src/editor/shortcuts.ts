/*
 * The keyboard shortcut table: one list drives both dispatch (useShortcuts)
 * and the cheat sheet in Help. Pure, no DOM, so it can be tested in node.
 * Shortcuts are a bonus: every action here also has a button or menu item.
 */

export type ShortcutId =
  | 'undo'
  | 'redo'
  | 'copy'
  | 'cut'
  | 'paste'
  | 'duplicate'
  | 'delete'
  | 'select-all'
  | 'edit-label'
  | 'clear'
  | 'group'
  | 'ungroup'
  | 'save'
  | 'nudge-left'
  | 'nudge-right'
  | 'nudge-up'
  | 'nudge-down'
  | 'nudge-left-far'
  | 'nudge-right-far'
  | 'nudge-up-far'
  | 'nudge-down-far'
  | 'zoom-in'
  | 'zoom-out'
  | 'fit-view'
  | 'toggle-snap'
  | 'tool-select'
  | 'tool-pan'
  | 'tool-link'
  | 'search'
  | 'shortcuts'

export type ShortcutArea = 'Edit' | 'Arrange' | 'View' | 'Modes' | 'Find and help'

/** A key combination. `mod` is Cmd on a Mac and Ctrl elsewhere. `shift: undefined` means either. */
export interface KeyCombo {
  key: string
  mod?: boolean
  shift?: boolean
}

export interface Shortcut {
  id: ShortcutId
  area: ShortcutArea
  /** What it does, for the cheat sheet. */
  label: string
  combos: KeyCombo[]
  /** Listed in the cheat sheet (the far nudges are folded into the plain ones). */
  listed?: boolean
}

const letter = (key: string, mod = false, shift = false): KeyCombo => ({ key, mod, shift })
// Symbols already include Shift on most layouts ("?" is Shift+/, "+" is Shift+=), so Shift is either.
const symbol = (key: string): KeyCombo => ({ key, mod: false })

export const SHORTCUTS: readonly Shortcut[] = [
  { id: 'undo', area: 'Edit', label: 'Undo', combos: [letter('z', true)] },
  { id: 'redo', area: 'Edit', label: 'Redo', combos: [letter('z', true, true), letter('y', true)] },
  { id: 'copy', area: 'Edit', label: 'Copy', combos: [letter('c', true)] },
  { id: 'cut', area: 'Edit', label: 'Cut', combos: [letter('x', true)] },
  { id: 'paste', area: 'Edit', label: 'Paste', combos: [letter('v', true)] },
  { id: 'duplicate', area: 'Edit', label: 'Duplicate', combos: [letter('d', true)] },
  { id: 'delete', area: 'Edit', label: 'Delete the selection', combos: [{ key: 'Delete', mod: false }, { key: 'Backspace', mod: false }] },
  { id: 'select-all', area: 'Edit', label: 'Select everything', combos: [letter('a', true)] },
  { id: 'edit-label', area: 'Edit', label: 'Edit the selected shape’s label', combos: [{ key: 'Enter', mod: false, shift: false }] },
  { id: 'clear', area: 'Edit', label: 'Clear the selection, close menus and search', combos: [{ key: 'Escape', mod: false }] },
  { id: 'save', area: 'Edit', label: 'Save as JSON', combos: [letter('s', true)] },

  { id: 'nudge-left', area: 'Arrange', label: 'Nudge the selection (Shift: a bigger step)', combos: [{ key: 'ArrowLeft', mod: false, shift: false }] },
  { id: 'nudge-right', area: 'Arrange', label: '', combos: [{ key: 'ArrowRight', mod: false, shift: false }], listed: false },
  { id: 'nudge-up', area: 'Arrange', label: '', combos: [{ key: 'ArrowUp', mod: false, shift: false }], listed: false },
  { id: 'nudge-down', area: 'Arrange', label: '', combos: [{ key: 'ArrowDown', mod: false, shift: false }], listed: false },
  { id: 'nudge-left-far', area: 'Arrange', label: '', combos: [{ key: 'ArrowLeft', mod: false, shift: true }], listed: false },
  { id: 'nudge-right-far', area: 'Arrange', label: '', combos: [{ key: 'ArrowRight', mod: false, shift: true }], listed: false },
  { id: 'nudge-up-far', area: 'Arrange', label: '', combos: [{ key: 'ArrowUp', mod: false, shift: true }], listed: false },
  { id: 'nudge-down-far', area: 'Arrange', label: '', combos: [{ key: 'ArrowDown', mod: false, shift: true }], listed: false },
  { id: 'group', area: 'Arrange', label: 'Group', combos: [letter('g', true)] },
  { id: 'ungroup', area: 'Arrange', label: 'Ungroup', combos: [letter('g', true, true)] },

  { id: 'zoom-in', area: 'View', label: 'Zoom in', combos: [symbol('+'), symbol('=')] },
  { id: 'zoom-out', area: 'View', label: 'Zoom out', combos: [symbol('-')] },
  { id: 'fit-view', area: 'View', label: 'Fit to screen', combos: [letter('f')] },
  { id: 'toggle-snap', area: 'View', label: 'Snap to grid on or off', combos: [letter('g')] },

  { id: 'tool-select', area: 'Modes', label: 'Select and move', combos: [letter('v')] },
  { id: 'tool-pan', area: 'Modes', label: 'Pan', combos: [letter('h')] },
  { id: 'tool-link', area: 'Modes', label: 'Link', combos: [letter('l')] },

  { id: 'search', area: 'Find and help', label: 'Find in the diagram', combos: [letter('f', true)] },
  { id: 'shortcuts', area: 'Find and help', label: 'Keyboard shortcuts', combos: [symbol('?')] },
]

/** The parts of a KeyboardEvent dispatch looks at. */
export interface KeyInput {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
  altKey: boolean
}

const sameKey = (a: string, b: string) => (a.length === 1 && b.length === 1 ? a.toLowerCase() === b.toLowerCase() : a === b)

/**
 * The shortcut a key press means, or null. Cmd on a Mac, Ctrl elsewhere;
 * the other one (and any Alt combination) is left to the browser and system.
 */
export function resolveShortcut(e: KeyInput, mac: boolean): ShortcutId | null {
  if (e.altKey) return null
  const mod = mac ? e.metaKey : e.ctrlKey
  const other = mac ? e.ctrlKey : e.metaKey
  if (other) return null
  for (const s of SHORTCUTS) {
    for (const c of s.combos) {
      if (Boolean(c.mod) !== mod || !sameKey(c.key, e.key)) continue
      if (c.shift !== undefined && c.shift !== e.shiftKey) continue
      return s.id
    }
  }
  return null
}

/** The element a key event came from, as far as dispatch cares. */
export interface KeyTarget {
  tagName?: string
  isContentEditable?: boolean
}

/** True while typing: shortcuts must not steal keys from fields, label editing or the search box. */
export function isTypingTarget(target: KeyTarget | null | undefined): boolean {
  if (!target) return false
  return Boolean(target.isContentEditable) || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName ?? '')
}

export const isMacPlatform = (platform: string) => /Mac|iPhone|iPad|iPod/i.test(platform)

const ARROWS: Record<string, { x: number; y: number }> = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
}

/** For nudge shortcuts: the direction and whether it's the bigger step. */
export function nudgeOf(id: ShortcutId): { direction: { x: number; y: number }; far: boolean } | null {
  const match = /^nudge-(left|right|up|down)(-far)?$/.exec(id)
  const direction = match?.[1] ? ARROWS[match[1]] : undefined
  return direction ? { direction, far: Boolean(match?.[2]) } : null
}

const MAC_NAMES: Record<string, string> = { ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Backspace: 'Delete ⌫', Delete: 'Fwd Del ⌦', Escape: 'Esc', Enter: 'Return' }
const PC_NAMES: Record<string, string> = { ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Escape: 'Esc' }

/** Key caps for one combination, e.g. ['⌘', '⇧', 'Z'] on a Mac or ['Ctrl', 'Shift', 'Z'] elsewhere. */
export function formatCombo(c: KeyCombo, mac: boolean): string[] {
  const names = mac ? MAC_NAMES : PC_NAMES
  const key = names[c.key] ?? (c.key.length === 1 ? c.key.toUpperCase() : c.key)
  const caps: string[] = []
  if (c.mod) caps.push(mac ? '⌘' : 'Ctrl')
  if (c.shift) caps.push(mac ? '⇧' : 'Shift')
  caps.push(key)
  return caps
}

// "Nudge" is listed once, as the four arrows.
const NUDGE_CAPS: KeyCombo[] = [{ key: 'Arrow keys' }]

export interface CheatSheetRow {
  label: string
  mac: string[][]
  other: string[][]
}

/** The cheat sheet: listed shortcuts grouped by area, in table order, with both key sets. */
export function cheatSheet(): { area: ShortcutArea; rows: CheatSheetRow[] }[] {
  const out: { area: ShortcutArea; rows: CheatSheetRow[] }[] = []
  for (const s of SHORTCUTS) {
    if (s.listed === false) continue
    let section = out.find((x) => x.area === s.area)
    if (!section) out.push((section = { area: s.area, rows: [] }))
    const combos = s.id === 'nudge-left' ? NUDGE_CAPS : s.combos
    section.rows.push({ label: s.label, mac: combos.map((c) => formatCombo(c, true)), other: combos.map((c) => formatCombo(c, false)) })
  }
  return out
}
