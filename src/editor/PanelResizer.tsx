import { useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { clampPaletteWidth, shouldCollapse } from './paletteWidth'

const KEY_STEP = 16

/**
 * A side panel's inner edge: drag (mouse, pen or touch) or use the arrow keys
 * to resize. Released well below the minimum, the panel collapses.
 * Double-click restores the default width. `edge` is the side the handle sits
 * on: "right" for a left-hand panel (the palette), "left" for a right-hand one.
 */
export function PanelResizer({
  edge,
  label,
  width,
  min,
  max,
  onResize,
  onCommit,
  onCollapse,
  onReset,
}: {
  edge: 'left' | 'right'
  label: string
  width: number
  min: number
  max: number
  onResize: (width: number) => void
  onCommit: (width: number) => void
  onCollapse: () => void
  onReset: () => void
}) {
  const drag = useRef<{ pointerId: number; x: number; width: number; raw: number } | null>(null)
  const [active, setActive] = useState(false)
  /** Which way the arrow keys grow the panel: towards the canvas. */
  const grow = edge === 'right' ? 1 : -1
  const end = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || d.pointerId !== e.pointerId) return
    drag.current = null
    setActive(false)
    if (shouldCollapse(d.raw, min)) {
      onResize(d.width)
      onCollapse()
    } else {
      onCommit(clampPaletteWidth(d.raw, min, max))
    }
  }
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={width}
      title="Drag to resize. Double-click for the default width."
      tabIndex={0}
      className={cn(
        'group absolute inset-y-0 z-10 flex w-(--cl-palette-resize-hit) cursor-col-resize touch-none justify-center outline-none',
        edge === 'right' ? 'right-0 translate-x-1/2' : 'left-0 -translate-x-1/2',
      )}
      onPointerDown={(e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return
        e.preventDefault()
        e.currentTarget.setPointerCapture(e.pointerId)
        drag.current = { pointerId: e.pointerId, x: e.clientX, width, raw: width }
        setActive(true)
      }}
      onPointerMove={(e) => {
        const d = drag.current
        if (!d || d.pointerId !== e.pointerId) return
        d.raw = d.width + (edge === 'right' ? 1 : -1) * (e.clientX - d.x)
        onResize(clampPaletteWidth(d.raw, min, max))
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onDoubleClick={onReset}
      onKeyDown={(e) => {
        const next =
          e.key === 'ArrowLeft'
            ? width - grow * KEY_STEP
            : e.key === 'ArrowRight'
              ? width + grow * KEY_STEP
              : e.key === 'Home'
                ? min
                : e.key === 'End'
                  ? max
                  : null
        if (next === null) return
        e.preventDefault()
        onCommit(clampPaletteWidth(next, min, max))
      }}
    >
      <div
        aria-hidden="true"
        className={cn(
          'h-full w-0.5 transition-colors group-hover:bg-accent group-focus-visible:bg-accent',
          active ? 'bg-accent' : 'bg-transparent',
        )}
      />
    </div>
  )
}

