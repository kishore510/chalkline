import { useEffect, useRef } from 'react'
import { useDiagramStore } from '@/store/diagramStore'
import { useUiStore } from '@/store/uiStore'

/** Inline label editor. Enter saves, Shift+Enter adds a line, Escape cancels, tapping away saves. */
export function LabelEditor({ id, initial }: { id: string; initial: string }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const done = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus()
    el.select()
  }, [])

  const finish = (save: boolean) => {
    if (done.current) return
    done.current = true
    if (save && ref.current) useDiagramStore.getState().setNodeLabel(id, ref.current.value)
    useUiStore.getState().setEditing(null)
  }

  return (
    <textarea
      ref={ref}
      defaultValue={initial}
      aria-label="Label"
      rows={1}
      // nodrag/nopan/nowheel stop React Flow treating typing or selecting text as canvas gestures.
      // Grows with its text, so the whole label stays visible while editing.
      className="nodrag nopan nowheel block w-full field-sizing-content resize-none bg-transparent text-center text-inherit outline-none select-text"
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault()
          finish(true)
        } else if (e.key === 'Escape') {
          e.preventDefault()
          finish(false)
        }
      }}
      onBlur={() => finish(true)}
    />
  )
}
