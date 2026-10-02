import { lazy, Suspense, useEffect, useRef } from 'react'
import { useAiSheet } from './GenerateEntry'
import { GeneratePanel } from './GenerateSheet'
import { NotesPanel } from './NotesSheet'
import { ReviewPanel } from './ReviewSheet'
import { SummarisePanel } from './SummariseSheet'

// Refine loads on its own (bundled in, it pulled canvas and export code into the app's first download).
// It starts loading as soon as the sheet opens, so it's there by the time its tab is chosen.
const loadRefine = () => import('./RefineSheet')
const RefinePanel = lazy(() => loadRefine().then((m) => ({ default: m.RefinePanel })))

/*
 * The AI sheet: Generate (6b), Summarise (6c), Review (6e), Notes (6d) or Refine (6f), switched on
 * each mode's first page. The panels stay mounted while the sheet is open,
 * so switching keeps a description or a summary; only the active one shows
 * its frame. Review results and suggested notes live in their own stores
 * and outlast the sheet.
 */
export default function AiSheet() {
  const mode = useAiSheet((s) => s.mode)

  useEffect(() => void loadRefine(), [])

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
      <ReviewPanel active={mode === 'review'} />
      <NotesPanel active={mode === 'notes'} />
      <Suspense fallback={null}>
        <RefinePanel active={mode === 'refine'} />
      </Suspense>
    </>
  )
}
