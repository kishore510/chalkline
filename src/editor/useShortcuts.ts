import { useEffect } from 'react'
import { useCanvasActions } from '@/canvas/useCanvasActions'
import { parseFragment, serializeFragment } from '@/store/clipboard'
import { useHelpStore } from '@/help/helpStore'
import { useSearchStore } from '@/search/searchStore'
import { useDiagramStore } from '@/store/diagramStore'
import { useUiStore } from '@/store/uiStore'
import { explainBlockedAdd } from './layerNotices'
import { deleteSelectionWithNotice } from './deleteSelection'
import { saveJson } from './FileMenu'
import { focusProperties } from '@/canvas/useCanvasKeyboard'
import { isMacPlatform, isTypingTarget, nudgeOf, resolveShortcut, type ShortcutId } from './shortcuts'

const isTyping = (target: EventTarget | null) => target instanceof HTMLElement && isTypingTarget(target)

/** Canvas shortcuts don't apply while a dialog is open over it. */
const inDialog = (target: EventTarget | null) => target instanceof Element && target.closest('[aria-modal="true"]') !== null

/** Arrow keys belong to menus, lists, sliders and the like when they have focus. */
const COMPOSITE = '[role="menu"],[role="menubar"],[role="listbox"],[role="tablist"],[role="radiogroup"],[role="slider"],[role="tree"],[role="grid"],[role="spinbutton"]'
const inComposite = (target: EventTarget | null) => target instanceof Element && target.closest(COMPOSITE) !== null

/** Focus is on the canvas (or nowhere in particular), so canvas keys like Ctrl+F are ours, not the browser's. */
const canvasFocused = (target: EventTarget | null) =>
  !(target instanceof Element) || target === document.body || target === document.documentElement || target.closest('.react-flow') !== null

const mac = () => {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } }
  return isMacPlatform(nav.userAgentData?.platform || nav.platform || '')
}

/** Puts the copied shapes on the system clipboard too, so they can be pasted in another tab. */
function copyToSystemClipboard() {
  const fragment = useDiagramStore.getState().clipboard
  if (fragment) navigator.clipboard?.writeText(serializeFragment(fragment)).catch(() => undefined)
}

/**
 * Keyboard shortcuts, from the table in shortcuts.ts. A bonus only: every
 * action also has a button or menu item.
 */
export function useShortcuts() {
  const actions = useCanvasActions()
  useEffect(() => {
    const isMac = mac()

    /** Runs a shortcut. Returns false if it didn't apply, so the key keeps its usual meaning. */
    const run = (id: ShortcutId, e: KeyboardEvent): boolean => {
      const ui = useUiStore.getState()
      const diagram = useDiagramStore.getState()
      switch (id) {
        case 'undo':
          diagram.undo()
          return true
        case 'redo':
          diagram.redo()
          return true
        case 'copy':
          if (!diagram.copySelection()) return false
          copyToSystemClipboard()
          return true
        case 'cut':
          if (!diagram.copySelection()) return false
          copyToSystemClipboard()
          diagram.deleteSelection()
          return true
        case 'paste':
          // Handled by the paste event below, which carries the system clipboard.
          return false
        case 'duplicate':
          if (diagram.selection.length > 0 && diagram.duplicateSelection().length === 0) explainBlockedAdd()
          return true
        case 'save':
          void saveJson()
          return true
        case 'group':
          if (diagram.selection.length > 0 && !diagram.groupSelection() && !explainBlockedAdd()) {
            ui.notify('Can’t group here: containers can’t go inside a lane.')
          }
          return true
        case 'ungroup': {
          const groups = new Set(diagram.diagram.groups.map((g) => g.id))
          for (const sid of diagram.selection) if (groups.has(sid)) diagram.ungroup(sid)
          return true
        }
        case 'select-all':
          diagram.setSelection([...diagram.diagram.nodes.map((n) => n.id), ...diagram.diagram.edges.map((edge) => edge.id)])
          return true
        case 'delete':
          if (diagram.selection.length === 0) return false
          deleteSelectionWithNotice()
          return true
        case 'edit-label': {
          const [only, ...rest] = diagram.selection
          if (!only || rest.length > 0 || !diagram.diagram.nodes.some((n) => n.id === only)) return false
          ui.setEditing(only)
          return true
        }
        case 'clear':
          useSearchStore.getState().close()
          ui.clearLinkSource()
          ui.closeContextMenu()
          ui.setPaletteOpen(false)
          diagram.setSelection([])
          // Escape keeps its usual meaning too (e.g. leaving full screen).
          return false
        case 'tool-select':
          ui.setTool('select')
          return true
        case 'tool-pan':
          ui.setTool('pan')
          return true
        case 'tool-link':
          ui.setTool('link')
          return true
        case 'toggle-snap':
          ui.toggleSnap()
          return true
        case 'fit-view':
          actions.fitView()
          return true
        case 'zoom-in':
          actions.zoomIn()
          return true
        case 'zoom-out':
          actions.zoomOut()
          return true
        case 'search':
          // Ctrl/Cmd+F is the browser's find unless the canvas has focus.
          if (!canvasFocused(e.target)) return false
          useSearchStore.getState().openSearch()
          return true
        case 'shortcuts':
          useHelpStore.getState().openHelp({ kind: 'shortcuts' })
          return true
        case 'focus-properties':
          return diagram.selection.length > 0 && focusProperties()
        default: {
          const nudge = nudgeOf(id)
          return nudge ? actions.nudge(nudge.direction, nudge.far) : false
        }
      }
    }

    const ignored = (e: KeyboardEvent) => e.defaultPrevented || isTyping(e.target) || inDialog(e.target)

    const onKeyDown = (e: KeyboardEvent) => {
      if (ignored(e)) return
      const id = resolveShortcut(e, isMac)
      if (!id || nudgeOf(id)) return
      if (run(id, e)) e.preventDefault()
    }

    // Arrow keys are caught on the way down, before React Flow's own handler on a
    // focused shape (which moves it unsnapped, one undo step per press).
    const onArrowKey = (e: KeyboardEvent) => {
      if (!e.key.startsWith('Arrow') || ignored(e) || inComposite(e.target)) return
      const id = resolveShortcut(e, isMac)
      if (!id || !nudgeOf(id) || !run(id, e)) return
      e.preventDefault()
      e.stopPropagation()
    }

    // Paste arrives as an event carrying the clipboard text, so shapes copied in
    // another tab (or window) paste too. Falls back to the in-app clipboard.
    const onPaste = (e: ClipboardEvent) => {
      if (isTyping(e.target)) return
      const fragment = parseFragment(e.clipboardData?.getData('text/plain') ?? '')
      const store = useDiagramStore.getState()
      const pasted = fragment ? store.pasteFrom(fragment) : store.paste()
      if (pasted.length > 0) e.preventDefault()
      else if (fragment || store.clipboard) explainBlockedAdd()
    }

    window.addEventListener('keydown', onArrowKey, true)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('paste', onPaste)
    return () => {
      window.removeEventListener('keydown', onArrowKey, true)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('paste', onPaste)
    }
  }, [actions])
}
