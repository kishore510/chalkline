import { Pencil, Trash2 } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Panel } from '@/components/ui/panel'
import { useDiagramStore } from '@/store/diagramStore'
import { useUiStore } from '@/store/uiStore'

/** Right-click (mouse) or long-press (touch) menu for a node or edge. */
export function ContextMenu() {
  const menu = useUiStore((s) => s.contextMenu)
  const close = useUiStore((s) => s.closeContextMenu)
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

  if (!menu) return null

  const run = (action: () => void) => () => {
    close()
    action()
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
      <Button role="menuitem" variant="ghost" className="justify-start text-danger" onClick={run(() => useDiagramStore.getState().deleteElements([menu.id]))}>
        <Trash2 />
        Delete
      </Button>
    </Panel>
  )
}
