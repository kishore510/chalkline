import { useSyncExternalStore } from 'react'
import { Editor } from '@/editor/Editor'
import { StyleSheetPage } from '@/pages/StyleSheetPage'

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
  return useHash() === '#/styles' ? <StyleSheetPage /> : <Editor />
}
