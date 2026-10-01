import { useStoreApi } from '@xyflow/react'
import { useEffect } from 'react'
import { explainBlockedAdd } from '@/editor/layerNotices'
import { isTypingTarget } from '@/editor/shortcuts'
import { useDiagramStore } from '@/store/diagramStore'
import { useUiStore } from '@/store/uiStore'
import { focusOrder, nextFocus, type FocusStop } from './focusOrder'
import { buildRenderModel } from './renderModel'

/*
 * Keyboard use of the canvas, for people without a mouse. The canvas is one
 * Tab stop. From it:
 *   Tab / Shift+Tab  next / previous shape or group in reading order, then connectors;
 *                    past either end, focus leaves the canvas as usual (no trap).
 *   Enter            select the focused item; on a selected shape, edit its label;
 *                    on a selected connector, go to its label field. In Link mode, link.
 *   Space            add the focused item to the selection, or take it out.
 *   Shift+F10, Menu  the item's menu (as right-click or long-press).
 * Arrow keys nudge the selection (useShortcuts); they never move focus.
 */

/** The canvas item a key event came from, if any. */
function stopOf(target: EventTarget | null): { id: string; kind: 'node' | 'edge' } | null {
  if (!(target instanceof Element)) return null
  const node = target.closest<HTMLElement>('.react-flow__node')
  if (node?.dataset.id) return { id: node.dataset.id, kind: 'node' }
  const edge = target.closest<SVGElement>('.react-flow__edge')
  const id = edge?.getAttribute('data-id')
  return id ? { id, kind: 'edge' } : null
}

function focusStop(root: HTMLElement, stop: FocusStop) {
  const selector = stop.kind === 'connector' ? `.react-flow__edge[data-id="${CSS.escape(stop.id)}"]` : `.react-flow__node[data-id="${CSS.escape(stop.id)}"]`
  root.querySelector<HTMLElement | SVGElement>(selector)?.focus()
}

export function useCanvasKeyboard() {
  const rfStore = useStoreApi()
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return
      const root = rfStore.getState().domNode
      if (!root || !(e.target instanceof Node) || !root.contains(e.target)) return
      if (e.target instanceof HTMLElement && isTypingTarget(e.target)) return
      const stop = stopOf(e.target)

      if (e.key === 'Tab') {
        const { diagram } = useDiagramStore.getState()
        const order = focusOrder(diagram, buildRenderModel(diagram))
        const next = nextFocus(order, stop?.id ?? null, e.shiftKey)
        // Past the ends the browser moves focus on, out of the canvas.
        if (!next) return
        e.preventDefault()
        focusStop(root, next)
        return
      }
      // The menu a right-click or long-press opens: Shift+F10 or the Menu key, at the focused item.
      if (stop && (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey))) {
        e.preventDefault()
        e.stopPropagation()
        const rect = (e.target as Element).getBoundingClientRect()
        const isGroup = useDiagramStore.getState().diagram.groups.some((g) => g.id === stop.id)
        if (!useDiagramStore.getState().selection.includes(stop.id)) useDiagramStore.getState().setSelection([stop.id])
        useUiStore.getState().openContextMenu({ id: stop.id, kind: stop.kind === 'edge' ? 'edge' : isGroup ? 'group' : 'node', x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
        return
      }
      if (!stop || (e.key !== 'Enter' && e.key !== ' ')) return
      // Ours, not React Flow's own Enter/Space handling (or the global Enter shortcut).
      e.preventDefault()
      e.stopPropagation()
      const diagram = useDiagramStore.getState()
      const ui = useUiStore.getState()
      const isShape = diagram.diagram.nodes.some((n) => n.id === stop.id)
      const isGroup = !isShape && diagram.diagram.groups.some((g) => g.id === stop.id)
      if (e.key === ' ') {
        const selected = diagram.selection.includes(stop.id)
        diagram.setSelection(selected ? diagram.selection.filter((id) => id !== stop.id) : [...diagram.selection, stop.id])
        return
      }
      if (ui.tool === 'link') {
        if (isShape && ui.linkTap(stop.id) === 'refused') explainBlockedAdd()
        return
      }
      const onlyThis = diagram.selection.length === 1 && diagram.selection[0] === stop.id
      if (!onlyThis) return diagram.setSelection([stop.id])
      if (isShape) ui.setEditing(stop.id)
      else if (isGroup) focusProperties()
      else ui.requestLabelFocus()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [rfStore])
}

function focusFirstProperty(): boolean {
  const panel = document.querySelector<HTMLElement>('[data-properties]')
  const first = panel?.querySelector<HTMLElement>('input, select, textarea, button:not([disabled]), [tabindex="0"]')
  first?.focus()
  return Boolean(first)
}

/**
 * Moves focus to the first control of the selection's properties (panel,
 * slide-over or sheet), bringing the desktop panel back from its rail or the
 * Layers tab first if needed.
 */
export function focusProperties(): boolean {
  if (focusFirstProperty()) return true
  const ui = useUiStore.getState()
  ui.setLayersOpen(false)
  if (ui.rightPanelCollapsed) ui.setRightPanelCollapsed(false)
  requestAnimationFrame(() => focusFirstProperty())
  return true
}
