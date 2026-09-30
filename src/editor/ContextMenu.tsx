import { useReactFlow } from '@xyflow/react'
import { BookmarkPlus, ClipboardPaste, Copy, CopyPlus, Pencil, RotateCcw, Trash2, Ungroup } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Panel } from '@/components/ui/panel'
import { useDiagramStore } from '@/store/diagramStore'
import { useUiStore } from '@/store/uiStore'
import { explainBlockedAdd } from './layerNotices'
import { saveSelectionAsStencil } from './stencils/actions'

/** Right-click (mouse) or long-press (touch) menu for a node, an edge, a connector grip or empty canvas. */
export function ContextMenu() {
  const menu = useUiStore((s) => s.contextMenu)
  const close = useUiStore((s) => s.closeContextMenu)
  const hasClipboard = useDiagramStore((s) => s.clipboard !== null)
  const { screenToFlowPosition } = useReactFlow()
  const ref = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)

  // Keep the menu fully on screen.
  useLayoutEffect(() => {
    if (!menu || !ref.current) return setPosition(null)
    const { width, height } = ref.current.getBoundingClientRect()
    const margin = 8
    setPosition({
      left: Math.max(margin, Math.min(menu.x, window.innerWidth - width - margin)),
      top: Math.max(margin, Math.min(menu.y, window.innerHeight - height - margin)),
    })
  }, [menu])

  useEffect(() => {
    if (!menu) return
    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) close()
    }
    const onKeyDown = (e: KeyboardEvent) => e.key === 'Escape' && close()
    // Defer so the pointer that opened the menu doesn't immediately close it.
    const id = window.setTimeout(() => {
      document.addEventListener('pointerdown', onPointerDown, true)
      document.addEventListener('keydown', onKeyDown)
    })
    ref.current?.querySelector('button')?.focus()
    return () => {
      window.clearTimeout(id)
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [menu, close])

  const pinned = useDiagramStore((s) => {
    if (menu?.kind !== 'grip') return false
    const edge = s.diagram.edges.find((e) => e.id === menu.id)
    return Boolean(menu.end === 'source' ? edge?.sourceHandle : edge?.targetHandle)
  })

  if (!menu) return null

  const run = (action: () => void) => () => {
    close()
    action()
  }

  if (menu.kind === 'grip') {
    const which = menu.end === 'source' ? 'start' : 'end'
    return (
      <Panel
        ref={ref}
        role="menu"
        aria-label={`Connector ${which} actions`}
        className="fixed z-40 flex min-w-40 flex-col p-1 shadow-lg"
        style={position ?? { left: menu.x, top: menu.y, visibility: 'hidden' }}
      >
        <Button
          role="menuitem"
          variant="ghost"
          className="justify-start"
          disabled={!pinned}
          onClick={run(() => useDiagramStore.getState().setEdgeSides([menu.id], { [menu.end ?? 'source']: null }))}
        >
          <RotateCcw />
          {pinned ? `Reset ${which} to auto` : `The ${which} is on auto`}
        </Button>
        <p className="px-3 pt-1 pb-2 text-xs text-text-muted">Drag the grip onto a side to pin it.</p>
      </Panel>
    )
  }

  const store = useDiagramStore.getState

  if (menu.kind === 'pane') {
    return (
      <Panel
        ref={ref}
        role="menu"
        aria-label="Canvas actions"
        className="fixed z-40 flex min-w-40 flex-col p-1 shadow-lg"
        style={position ?? { left: menu.x, top: menu.y, visibility: 'hidden' }}
      >
        <Button
          role="menuitem"
          variant="ghost"
          className="justify-start"
          disabled={!hasClipboard}
          onClick={run(() => {
            if (store().paste(screenToFlowPosition({ x: menu.x, y: menu.y })).length === 0) explainBlockedAdd()
          })}
        >
          <ClipboardPaste />
          Paste here
        </Button>
        {!hasClipboard && <p className="px-3 pt-1 pb-2 text-xs text-text-muted">Copy a shape first.</p>}
      </Panel>
    )
  }

  if (menu.kind === 'group') {
    return (
      <Panel
        ref={ref}
        role="menu"
        aria-label="Group actions"
        className="fixed z-40 flex min-w-48 flex-col p-1 shadow-lg"
        style={position ?? { left: menu.x, top: menu.y, visibility: 'hidden' }}
      >
        <Button role="menuitem" variant="ghost" className="justify-start" onClick={run(() => store().duplicateSelection())}>
          <CopyPlus />
          Duplicate
        </Button>
        <Button role="menuitem" variant="ghost" className="justify-start" onClick={run(() => store().copySelection())}>
          <Copy />
          Copy
        </Button>
        <Button role="menuitem" variant="ghost" className="justify-start" onClick={run(saveSelectionAsStencil)}>
          <BookmarkPlus />
          Save as stencil…
        </Button>
        <Button role="menuitem" variant="ghost" className="justify-start" onClick={run(() => store().ungroup(menu.id))}>
          <Ungroup />
          Ungroup
        </Button>
        <Button role="menuitem" variant="ghost" className="justify-start text-danger" onClick={run(() => store().deleteGroupsWithContents([menu.id]))}>
          <Trash2 />
          Delete group and contents
        </Button>
      </Panel>
    )
  }

  return (
    <Panel
      ref={ref}
      role="menu"
      aria-label={menu.kind === 'node' ? 'Shape actions' : 'Connector actions'}
      className="fixed z-40 flex min-w-40 flex-col p-1 shadow-lg"
      style={position ?? { left: menu.x, top: menu.y, visibility: 'hidden' }}
    >
      <Button
        role="menuitem"
        variant="ghost"
        className="justify-start"
        onClick={run(() => (menu.kind === 'node' ? useUiStore.getState().setEditing(menu.id) : useUiStore.getState().requestLabelFocus()))}
      >
        <Pencil />
        Edit label
      </Button>
      {menu.kind === 'node' && (
        <>
          <Button role="menuitem" variant="ghost" className="justify-start" onClick={run(() => store().duplicateSelection())}>
            <CopyPlus />
            Duplicate
          </Button>
          <Button
            role="menuitem"
            variant="ghost"
            className="justify-start"
            onClick={run(() => {
              if (store().copySelection()) useUiStore.getState().notify('Copied. Long-press empty canvas to paste.')
            })}
          >
            <Copy />
            Copy
          </Button>
          <Button role="menuitem" variant="ghost" className="justify-start" onClick={run(saveSelectionAsStencil)}>
            <BookmarkPlus />
            Save as stencil…
          </Button>
        </>
      )}
      <Button role="menuitem" variant="ghost" className="justify-start text-danger" onClick={run(() => useDiagramStore.getState().deleteElements([menu.id]))}>
        <Trash2 />
        Delete
      </Button>
    </Panel>
  )
}
