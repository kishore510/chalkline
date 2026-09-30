import { useEffect } from 'react'
import { useCanvasActions } from '@/canvas/useCanvasActions'
import { useDiagramStore } from '@/store/diagramStore'
import { useUiStore } from '@/store/uiStore'

function isTyping(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
}

/**
 * Keyboard shortcuts. A bonus only: every action also has a button.
 */
export function useShortcuts() {
  const actions = useCanvasActions()
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.metaKey || e.ctrlKey || isTyping(e.target)) return
      const ui = useUiStore.getState()
      const diagram = useDiagramStore.getState()
      switch (e.key) {
        case 'v':
        case 'V':
          ui.setTool('select')
          break
        case 'h':
        case 'H':
          ui.setTool('pan')
          break
        case 'l':
        case 'L':
          ui.setTool('link')
          break
        case 'g':
        case 'G':
          ui.toggleSnap()
          break
        case 'f':
        case 'F':
          actions.fitView()
          break
        case '+':
        case '=':
          actions.zoomIn()
          break
        case '-':
          actions.zoomOut()
          break
        case 'Delete':
        case 'Backspace':
          if (diagram.selection.length === 0) return
          e.preventDefault()
          diagram.deleteSelection()
          break
        case 'Enter': {
          const [only, ...rest] = diagram.selection
          if (only && rest.length === 0 && diagram.diagram.nodes.some((n) => n.id === only)) {
            e.preventDefault()
            ui.setEditing(only)
          }
          break
        }
        case 'Escape':
          ui.clearLinkSource()
          ui.closeContextMenu()
          ui.setPaletteOpen(false)
          diagram.setSelection([])
          break
        default:
          return
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [actions])
}
