import { Settings as SettingsIcon } from 'lucide-react'
import { lazy, Suspense } from 'react'
import { create } from 'zustand'
import { Button } from '@/components/ui/button'

/*
 * The small, always-loaded parts of Settings: whether the sheet is open, the
 * top-bar button and the host. The sheet itself loads on first open.
 */

export type SettingsSection = 'appearance' | 'canvas' | 'text' | 'ai' | 'data' | 'about'

interface SettingsSheetState {
  open: boolean
  /** Section to scroll to when opening. */
  section: SettingsSection | null
  openSettings: (section?: SettingsSection) => void
  closeSettings: () => void
}

export const useSettingsSheet = create<SettingsSheetState>()((set) => ({
  open: false,
  section: null,
  openSettings: (section) => set({ open: true, section: section ?? null }),
  closeSettings: () => set({ open: false, section: null }),
}))

export const openSettings = (section?: SettingsSection) => useSettingsSheet.getState().openSettings(section)

const SettingsSheet = lazy(() => import('./SettingsSheet'))

/** Renders the settings sheet while it's open. */
export function SettingsSheetHost() {
  const open = useSettingsSheet((s) => s.open)
  if (!open) return null
  return (
    <Suspense fallback={null}>
      <SettingsSheet />
    </Suspense>
  )
}

/** Top-bar button (tablet and desktop; phones use the ☰ menu). */
export function SettingsButton() {
  return (
    <Button variant="ghost" size="icon" aria-label="Settings" title="Settings" aria-haspopup="dialog" onClick={() => openSettings()}>
      <SettingsIcon />
    </Button>
  )
}
