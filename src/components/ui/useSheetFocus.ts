import { useEffect, useRef, type RefObject } from 'react'
import { sheetFocus } from '@/lib/focusTrap'

/**
 * Non-modal sheets and panels: while `open`, focus moves in, Escape inside
 * calls `onEscape`, and on close focus returns to the opener (see sheetFocus).
 */
export function useSheetFocus(ref: RefObject<HTMLElement | null>, open: boolean, onEscape: () => void) {
  const escape = useRef(onEscape)
  useEffect(() => {
    escape.current = onEscape
  })
  useEffect(() => {
    const el = ref.current
    if (!open || !el) return
    return sheetFocus<HTMLElement>(el, document, () => escape.current())
  }, [ref, open])
}
