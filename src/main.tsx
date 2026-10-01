import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { installFontFaces } from '@/fonts/fontFaces'
import { startOnboarding } from '@/onboarding/onboardingStore'
import { restoreAutosave, startAutosave } from '@/persistence/useAutosave'
import { App } from './App'
import './index.css'

// Sample diagrams opened via #/fixture/<name> are for checking layouts; they
// must not replace (or be saved over) the user's autosaved work.
if (/^#\/fixture\//.test(window.location.hash)) {
  startOnboarding('skipped')
} else {
  const startup = restoreAutosave()
  startAutosave()
  // First run (nothing saved, never visited): the welcome on the empty canvas.
  startOnboarding(startup.status)
}

// Label fonts: declared up front, downloaded only when a label uses them.
installFontFaces()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
