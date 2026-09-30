import { describe, expect, it, vi } from 'vitest'
import { FOCUSABLE, tabTarget, trapFocus } from './focusTrap'

/** A tiny stand-in for the DOM: elements that record focus into a shared document. */
function setup(names: string[], autofocus?: string) {
  const listeners = new Set<(e: never) => void>()
  const doc = {
    activeElement: null as unknown,
    addEventListener: (_: string, l: (e: never) => void) => void listeners.add(l),
    removeEventListener: (_: string, l: (e: never) => void) => void listeners.delete(l),
  }
  const el = (name: string) => ({ name, focus: () => void (doc.activeElement = item(name)) })
  const all = new Map(names.map((n) => [n, el(n)]))
  const item = (name: string) => all.get(name) ?? outside
  const outside = { name: 'outside', focus: () => void (doc.activeElement = outside) }
  const container = {
    querySelector: (selector: string) => (selector === '[data-autofocus]' ? (autofocus ? item(autofocus) : null) : selector === FOCUSABLE ? (all.values().next().value ?? null) : null),
    querySelectorAll: () => [...all.values()],
    contains: () => true,
  }
  const press = (key: string, shiftKey = false) => {
    const e = { key, shiftKey, preventDefault: vi.fn(), stopPropagation: vi.fn() }
    for (const l of listeners) l(e as never)
    return e
  }
  const active = () => (doc.activeElement as { name: string } | null)?.name
  return { doc, container, press, active, outside, listeners }
}

describe('tabTarget', () => {
  it('wraps at either end and leaves the middle to the browser', () => {
    expect(tabTarget(['a', 'b', 'c'], 'c', false)).toBe('a')
    expect(tabTarget(['a', 'b', 'c'], 'a', true)).toBe('c')
    expect(tabTarget(['a', 'b', 'c'], 'b', false)).toBeNull()
    expect(tabTarget(['a', 'b', 'c'], 'x', false)).toBe('a')
    expect(tabTarget([], 'x', false)).toBeNull()
  })
})

describe('trapFocus', () => {
  it('moves focus in on open, keeps it inside and restores it on close', () => {
    const t = setup(['close', 'search', 'topic'])
    t.outside.focus()
    const onEscape = vi.fn()
    const release = trapFocus(t.container, t.doc, onEscape)
    expect(t.active()).toBe('close')

    t.press('Tab', true)
    expect(t.active()).toBe('topic')
    const e = t.press('Tab')
    expect(e.preventDefault).toHaveBeenCalled()
    expect(t.active()).toBe('close')
    expect(t.press('Tab').preventDefault).not.toHaveBeenCalled()

    t.press('Escape')
    expect(onEscape).toHaveBeenCalledOnce()

    release()
    expect(t.active()).toBe('outside')
    expect(t.listeners.size).toBe(0)
  })

  it('prefers [data-autofocus]', () => {
    const t = setup(['close', 'search'], 'search')
    trapFocus(t.container, t.doc, () => undefined)
    expect(t.active()).toBe('search')
  })
})
