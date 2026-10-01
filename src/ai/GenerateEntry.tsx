import { WandSparkles } from 'lucide-react'
import { lazy, Suspense } from 'react'
import { create } from 'zustand'
import { Button } from '@/components/ui/button'

/*
 * The small, always-loaded parts of Generate diagram: whether its sheet is
 * open, the top-bar button and the host. The sheet, the request code and ELK
 * load on first open.
 */

interface GenerateSheetState {
  open: boolean
  openGenerate: () => void
  closeGenerate: () => void
}

export const useGenerateSheet = create<GenerateSheetState>()((set) => ({
  open: false,
  openGenerate: () => set({ open: true }),
  closeGenerate: () => set({ open: false }),
}))

export const openGenerate = () => useGenerateSheet.getState().openGenerate()

const GenerateSheet = lazy(() => import('./GenerateSheet'))

/** Renders the Generate diagram sheet while it's open. Inside the canvas provider: Add to canvas uses the view. */
export function GenerateSheetHost() {
  const open = useGenerateSheet((s) => s.open)
  if (!open) return null
  return (
    <Suspense fallback={null}>
      <GenerateSheet />
    </Suspense>
  )
}

/** Top-bar button (tablet and desktop; phones use the ☰ menu). */
export function AiButton() {
  return (
    <Button variant="ghost" aria-label="Generate a diagram with AI" title="Generate a diagram with AI" aria-haspopup="dialog" onClick={openGenerate} className="px-2">
      <WandSparkles />
      <span aria-hidden="true">AI</span>
    </Button>
  )
}
