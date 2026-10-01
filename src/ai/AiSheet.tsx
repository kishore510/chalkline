import { useEffect, useRef } from 'react'
import { useAiSheet } from './GenerateEntry'
import { GeneratePanel } from './GenerateSheet'
import { SummarisePanel } from './SummariseSheet'

/*
 * The AI sheet: Generate (6b) or Summarise (6c), switched on each mode's
 * first page. Both panels stay mounted while the sheet is open, so switching
 * keeps a description or a summary; only the active one shows its frame.
 */
export default function AiSheet() {
  const mode = useAiSheet((s) => s.mode)

  // After a switch, focus stays on the switch (now in the other panel's frame).
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    document.querySelector<HTMLElement>(`[role="dialog"] [data-mode="${mode}"]`)?.focus()
  }, [mode])

  return (
    <>
      <GeneratePanel active={mode === 'generate'} />
      <SummarisePanel active={mode === 'summarise'} />
    </>
  )
}
