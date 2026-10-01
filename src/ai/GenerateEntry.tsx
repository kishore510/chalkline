import { WandSparkles } from 'lucide-react'
import { lazy, Suspense } from 'react'
import { create } from 'zustand'
import { Button } from '@/components/ui/button'

/*
 * The small, always-loaded parts of the AI sheet (Generate and Summarise):
 * whether it's open and in which mode, the top-bar button and the host. The
 * sheet, the request code and ELK load on first open.
 */

export type AiMode = 'generate' | 'summarise'

interface AiSheetState {
  open: boolean
  /** Kept between openings, so the AI button reopens the last mode. */
  mode: AiMode
  openGenerate: () => void
  openSummarise: () => void
  /** Opens in the last mode used. */
  openAi: () => void
  setMode: (mode: AiMode) => void
  closeGenerate: () => void
}

export const useAiSheet = create<AiSheetState>()((set) => ({
  open: false,
  mode: 'generate',
  openGenerate: () => set({ open: true, mode: 'generate' }),
  openSummarise: () => set({ open: true, mode: 'summarise' }),
  openAi: () => set({ open: true }),
  setMode: (mode) => set({ mode }),
  closeGenerate: () => set({ open: false }),
}))

/** The same store, by its 6b name. */
export const useGenerateSheet = useAiSheet

export const openGenerate = () => useAiSheet.getState().openGenerate()
export const openSummarise = () => useAiSheet.getState().openSummarise()

const AiSheet = lazy(() => import('./AiSheet'))

/** Renders the AI sheet while it's open. Inside the canvas provider: Add to canvas uses the view. */
export function GenerateSheetHost() {
  const open = useAiSheet((s) => s.open)
  if (!open) return null
  return (
    <Suspense fallback={null}>
      <AiSheet />
    </Suspense>
  )
}

export const AI_BUTTON_LABEL = 'Generate or summarise with AI'

/** Top-bar button (tablet and desktop; phones use the ☰ menu). */
export function AiButton() {
  return (
    <Button variant="ghost" aria-label={AI_BUTTON_LABEL} title={AI_BUTTON_LABEL} aria-haspopup="dialog" onClick={() => useAiSheet.getState().openAi()} className="px-2">
      <WandSparkles />
      <span aria-hidden="true">AI</span>
    </Button>
  )
}
