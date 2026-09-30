import { useEffect } from 'react'
import { useCanvasActions } from '@/canvas/useCanvasActions'
import { parseFragment, serializeFragment } from '@/store/clipboard'
import { useDiagramStore } from '@/store/diagramStore'
import { useUiStore } from '@/store/uiStore'
import { saveJson } from './FileMenu'

function isTyping(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
}

/** Puts the copied shapes on the system clipboard too, so they can be pasted in another tab. */
function copyToSystemClipboard() {
  const fragment = useDiagramStore.getState().clipboard
  if (fragment) navigator.clipboard?.writeText(serializeFragment(fragment)).catch(() => undefined)
}

/**
 * Keyboard shortcuts. A bonus only: every action also has a button or menu item.
 */
export function useShortcuts() {
  const actions = useCanvasActions()
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || isTyping(e.target)) return
      const ui = useUiStore.getState()
      const diagram = useDiagramStore.getState()
      const key = e.key.toLowerCase()

      if (e.metaKey || e.ctrlKey) {
        switch (key) {
          case 'z':
            if (e.shiftKey) diagram.redo()
            else diagram.undo()
            break
          case 'y':
            diagram.redo()
            break
          case 'c':
            if (!diagram.copySelection()) return
            copyToSystemClipboard()
            break
          case 'x':
            if (!diagram.copySelection()) return
            copyToSystemClipboard()
            diagram.deleteSelection()
            break
          case 'd':
            diagram.duplicateSelection()
            break
          case 's':
            void saveJson()
            break
          case 'a':
            diagram.setSelection([...diagram.diagram.nodes.map((n) => n.id), ...diagram.diagram.edges.map((edge) => edge.id)])
            break
          default:
            // Ctrl/Cmd+V is handled by the paste event below.
            return
        }
        e.preventDefault()
        return
      }

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

    // Paste arrives as an event carrying the clipboard text, so shapes copied in
    // another tab (or window) paste too. Falls back to the in-app clipboard.
    const onPaste = (e: ClipboardEvent) => {
      if (isTyping(e.target)) return
      const fragment = parseFragment(e.clipboardData?.getData('text/plain') ?? '')
      const store = useDiagramStore.getState()
      const pasted = fragment ? store.pasteFrom(fragment) : store.paste()
      if (pasted.length > 0) e.preventDefault()
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('paste', onPaste)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('paste', onPaste)
    }
  }, [actions])
}
