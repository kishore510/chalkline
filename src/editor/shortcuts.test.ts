import { describe, expect, it } from 'vitest'
import { cheatSheet, formatCombo, isMacPlatform, isTypingTarget, nudgeOf, resolveShortcut, SHORTCUTS, type KeyInput } from './shortcuts'

const press = (key: string, mods: Partial<Omit<KeyInput, 'key'>> = {}): KeyInput => ({ key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...mods })

describe('resolveShortcut', () => {
  it('uses Ctrl off a Mac and Cmd on a Mac', () => {
    expect(resolveShortcut(press('z', { ctrlKey: true }), false)).toBe('undo')
    expect(resolveShortcut(press('z', { metaKey: true }), true)).toBe('undo')
    // The other modifier is left to the system (e.g. Ctrl+Z on a Mac).
    expect(resolveShortcut(press('z', { metaKey: true }), false)).toBeNull()
    expect(resolveShortcut(press('z', { ctrlKey: true }), true)).toBeNull()
  })

  it('maps the edit shortcuts', () => {
    const ctrl = (key: string, shiftKey = false) => resolveShortcut(press(key, { ctrlKey: true, shiftKey }), false)
    expect(ctrl('Z', true)).toBe('redo')
    expect(ctrl('y')).toBe('redo')
    expect(ctrl('c')).toBe('copy')
    expect(ctrl('x')).toBe('cut')
    expect(ctrl('v')).toBe('paste')
    expect(ctrl('d')).toBe('duplicate')
    expect(ctrl('a')).toBe('select-all')
    expect(ctrl('f')).toBe('search')
    expect(ctrl('g')).toBe('group')
    expect(ctrl('G', true)).toBe('ungroup')
    expect(resolveShortcut(press('Delete'), false)).toBe('delete')
    expect(resolveShortcut(press('Backspace'), true)).toBe('delete')
  })

  it('maps arrows to nudges, Shift to the bigger step', () => {
    expect(resolveShortcut(press('ArrowLeft'), false)).toBe('nudge-left')
    expect(resolveShortcut(press('ArrowDown', { shiftKey: true }), false)).toBe('nudge-down-far')
    expect(nudgeOf('nudge-up-far')).toEqual({ direction: { x: 0, y: -1 }, far: true })
    expect(nudgeOf('nudge-right')).toEqual({ direction: { x: 1, y: 0 }, far: false })
    expect(nudgeOf('undo')).toBeNull()
    // Ctrl/Cmd+arrow belongs to the system (word jumps, spaces, history).
    expect(resolveShortcut(press('ArrowLeft', { ctrlKey: true }), false)).toBeNull()
  })

  it('maps single keys for modes and view; symbols ignore Shift', () => {
    expect(resolveShortcut(press('v'), false)).toBe('tool-select')
    expect(resolveShortcut(press('H'), false)).toBe('tool-pan')
    expect(resolveShortcut(press('l'), false)).toBe('tool-link')
    expect(resolveShortcut(press('f'), false)).toBe('fit-view')
    expect(resolveShortcut(press('g'), false)).toBe('toggle-snap')
    expect(resolveShortcut(press('+', { shiftKey: true }), false)).toBe('zoom-in')
    expect(resolveShortcut(press('='), false)).toBe('zoom-in')
    expect(resolveShortcut(press('-'), false)).toBe('zoom-out')
    expect(resolveShortcut(press('?', { shiftKey: true }), false)).toBe('shortcuts')
  })

  it('canvas keys are listed but left to the canvas, so Tab and Space work normally elsewhere', () => {
    expect(resolveShortcut(press('Tab'), false)).toBeNull()
    expect(resolveShortcut(press('Tab', { shiftKey: true }), false)).toBeNull()
    expect(resolveShortcut(press(' '), false)).toBeNull()
    expect(resolveShortcut(press('p'), false)).toBe('focus-properties')
    expect(formatCombo({ key: ' ' }, true)).toEqual(['Space'])
  })

  it('leaves Alt combinations and unknown keys alone', () => {
    // Alt+Left is browser Back.
    expect(resolveShortcut(press('ArrowLeft', { altKey: true }), false)).toBeNull()
    expect(resolveShortcut(press('z', { ctrlKey: true, altKey: true }), false)).toBeNull()
    expect(resolveShortcut(press('q'), false)).toBeNull()
  })

  it('has no two shortcuts on the same keys', () => {
    const seen = new Map<string, string>()
    for (const s of SHORTCUTS) {
      for (const c of s.combos) {
        for (const shift of c.shift === undefined ? [false, true] : [c.shift]) {
          const sig = `${c.mod ? 'mod+' : ''}${shift ? 'shift+' : ''}${c.key.toLowerCase()}`
          expect(seen.get(sig), `${sig} is used by ${seen.get(sig)} and ${s.id}`).toBeUndefined()
          seen.set(sig, s.id)
        }
      }
    }
  })
})

describe('isTypingTarget', () => {
  it('is true in fields and editable text, so shortcuts are ignored there', () => {
    expect(isTypingTarget({ tagName: 'INPUT' })).toBe(true)
    expect(isTypingTarget({ tagName: 'TEXTAREA' })).toBe(true)
    expect(isTypingTarget({ tagName: 'SELECT' })).toBe(true)
    expect(isTypingTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true)
  })

  it('is false on the canvas, buttons and the page', () => {
    expect(isTypingTarget({ tagName: 'DIV', isContentEditable: false })).toBe(false)
    expect(isTypingTarget({ tagName: 'BUTTON' })).toBe(false)
    expect(isTypingTarget({ tagName: 'BODY' })).toBe(false)
    expect(isTypingTarget(null)).toBe(false)
  })
})

describe('cheat sheet', () => {
  it('detects Mac platforms', () => {
    expect(isMacPlatform('MacIntel')).toBe(true)
    expect(isMacPlatform('iPhone')).toBe(true)
    expect(isMacPlatform('Win32')).toBe(false)
    expect(isMacPlatform('Linux aarch64')).toBe(false)
  })

  it('formats keys for both platforms', () => {
    expect(formatCombo({ key: 'z', mod: true, shift: true }, true)).toEqual(['⌘', '⇧', 'Z'])
    expect(formatCombo({ key: 'z', mod: true, shift: true }, false)).toEqual(['Ctrl', 'Shift', 'Z'])
    expect(formatCombo({ key: 'Escape' }, false)).toEqual(['Esc'])
  })

  it('groups listed shortcuts by area, each with both key sets, nudges once', () => {
    const sheet = cheatSheet()
    expect(sheet.map((s) => s.area)).toEqual(['Canvas', 'Edit', 'Arrange', 'View', 'Modes', 'Find and help'])
    const rows = sheet.flatMap((s) => s.rows)
    for (const row of rows) {
      expect(row.label.length).toBeGreaterThan(0)
      expect(row.mac.length).toBe(row.other.length)
    }
    expect(rows.filter((r) => r.label.startsWith('Nudge'))).toHaveLength(1)
    expect(rows.find((r) => r.label === 'Undo')).toEqual({ label: 'Undo', mac: [['⌘', 'Z']], other: [['Ctrl', 'Z']] })
  })
})
