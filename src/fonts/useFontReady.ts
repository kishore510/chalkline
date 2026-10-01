import { useEffect, useState } from 'react'
import { loadFace } from './fontFaces'

/**
 * True once the label's font face is loaded. Until then the label shows in a
 * fallback font, so measuring it would grow the node to the wrong size (and
 * growing never shrinks back).
 */
export function useFontReady(spec: string) {
  const [ready, setReady] = useState(() => typeof document === 'undefined' || !document.fonts || document.fonts.check(spec))
  useEffect(() => {
    let live = true
    if (document.fonts?.check(spec)) setReady(true)
    else {
      setReady(false)
      void loadFace(spec).then(() => live && setReady(true))
    }
    return () => {
      live = false
    }
  }, [spec])
  return ready
}
