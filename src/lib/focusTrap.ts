/*
 * Focus trapping for modal dialogs and sheets: focus moves in on open (to
 * `[data-autofocus]` if present), Tab and Shift+Tab cycle inside, Escape
 * closes, and focus returns to where it was on release. Written against
 * minimal interfaces so it can be tested without a browser.
 */

export const FOCUSABLE =
  'a[href], button:not([disabled]), summary, input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export interface Focusable {
  focus: (options?: FocusOptions) => void
}

export interface FocusContainer<T extends Focusable> {
  querySelector: (selector: string) => T | null
  querySelectorAll: (selector: string) => ArrayLike<T>
  contains: (node: never) => boolean
}

export interface FocusDocument {
  activeElement: unknown
  addEventListener(type: 'keydown', listener: (e: KeyboardEvent) => void, capture: boolean): void
  removeEventListener(type: 'keydown', listener: (e: KeyboardEvent) => void, capture: boolean): void
}

/** Where Tab (or Shift+Tab) should go, or null to let the browser move focus normally. */
export function tabTarget<T>(items: readonly T[], active: unknown, shift: boolean): T | null {
  const head = items[0]
  const tail = items.at(-1)
  if (!head || !tail) return null
  const index = items.indexOf(active as T)
  if (index === -1) return shift ? tail : head
  if (shift && index === 0) return tail
  if (!shift && index === items.length - 1) return head
  return null
}

/** Starts trapping focus in `container`. Returns a release function that restores focus. */
export function trapFocus<T extends Focusable>(container: FocusContainer<T>, doc: FocusDocument, onEscape: () => void): () => void {
  const previous = doc.activeElement as Partial<Focusable> | null
  const first = container.querySelector('[data-autofocus]') ?? container.querySelector(FOCUSABLE)
  first?.focus()

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onEscape()
      return
    }
    if (e.key !== 'Tab') return
    const target = tabTarget(Array.from(container.querySelectorAll(FOCUSABLE)), doc.activeElement, e.shiftKey)
    if (!target) return
    e.preventDefault()
    target.focus()
  }

  doc.addEventListener('keydown', onKeyDown, true)
  return () => {
    doc.removeEventListener('keydown', onKeyDown, true)
    previous?.focus?.()
  }
}

export interface SheetContainer<T extends Focusable> extends FocusContainer<T> {
  addEventListener(type: 'keydown', listener: (e: KeyboardEvent) => void): void
  removeEventListener(type: 'keydown', listener: (e: KeyboardEvent) => void): void
}

/**
 * Focus for a non-modal sheet or panel (layers, palette drawer, search):
 * focus moves in on open (to `[data-autofocus]` if present, unless focus is
 * already inside), Escape inside it closes it, and on release focus returns
 * to where it was, if focus is still in the sheet or was dropped. No trap:
 * Tab moves on to the rest of the page as usual.
 */
export function sheetFocus<T extends Focusable>(container: SheetContainer<T>, doc: Pick<FocusDocument, 'activeElement'> & { body?: unknown }, onEscape: () => void): () => void {
  const previous = doc.activeElement as (Partial<Focusable> & { isConnected?: boolean }) | null
  if (!container.contains(doc.activeElement as never)) (container.querySelector('[data-autofocus]') ?? container.querySelector(FOCUSABLE))?.focus()
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return
    e.stopPropagation()
    onEscape()
  }
  container.addEventListener('keydown', onKeyDown)
  return () => {
    container.removeEventListener('keydown', onKeyDown)
    const active = doc.activeElement
    const dropped = active === null || active === doc.body
    if ((dropped || container.contains(active as never)) && previous?.isConnected !== false) previous?.focus?.()
  }
}
