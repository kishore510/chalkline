import { useEffect } from 'react'
import { startAnnouncements, useAnnounceStore } from './announce'

/**
 * The app's one polite live region: screen readers read what's put here
 * (selection, mode, undo and redo, search results, blocked moves). Visually
 * hidden. Re-keyed on each message so repeated words are read again.
 */
export function LiveRegion() {
  const message = useAnnounceStore((s) => s.message)
  useEffect(() => startAnnouncements(), [])
  return (
    <div aria-live="polite" aria-atomic="true" className="sr-only">
      {message && <span key={message.id}>{message.text}</span>}
    </div>
  )
}
