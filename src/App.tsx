import { lazy, Suspense, useSyncExternalStore } from 'react'
import { Editor } from '@/editor/Editor'

// The style sheet page is a design reference, not part of the editor: loaded only when opened.
const StyleSheetPage = lazy(() => import('@/pages/StyleSheetPage').then((m) => ({ default: m.StyleSheetPage })))

// Hash routing keeps the app host-agnostic: no server rewrites needed.
function useHash() {
  return useSyncExternalStore(
    (onChange) => {
      window.addEventListener('hashchange', onChange)
      return () => window.removeEventListener('hashchange', onChange)
    },
    () => window.location.hash,
  )
}

export function App() {
  return useHash() === '#/styles' ? (
    <Suspense fallback={null}>
      <StyleSheetPage />
    </Suspense>
  ) : (
    <Editor />
  )
}
