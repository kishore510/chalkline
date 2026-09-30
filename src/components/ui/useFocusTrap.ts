import { useEffect, useRef, type RefObject } from 'react'
import { trapFocus } from '@/lib/focusTrap'

/**
 * Keeps focus inside `ref` while mounted (see trapFocus): focus moves in,
 * Tab cycles, Escape calls `onEscape`, and focus returns on unmount.
 */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, onEscape: () => void) {
  const escape = useRef(onEscape)
  escape.current = onEscape
  useEffect(() => {
    const el = ref.current
    if (!el) return
    return trapFocus<HTMLElement>(el, document, () => escape.current())
  }, [ref])
}
