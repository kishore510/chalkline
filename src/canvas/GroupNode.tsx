import { NodeResizer, type Node, type NodeProps } from '@xyflow/react'
import { ChevronDown, ChevronRight, Lock } from 'lucide-react'
import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { resolveColour } from '@/lib/colour'
import { readToken } from '@/lib/cssVar'
import { cn } from '@/lib/utils'
import { fontSpec } from '@/fonts/fontFaces'
import { textCss, titleText } from '@/fonts/registry'
import { useFontReady } from '@/fonts/useFontReady'
import { currentTarget, useSearchStore } from '@/search/searchStore'
import { useDiagramStore } from '@/store/diagramStore'
import { endResize, startResize } from './guideSession'
import type { GroupView } from './renderModel'

export type GroupNodeData = { view: GroupView; selected: boolean; dropTarget: boolean }
export type GroupFlowNode = Node<GroupNodeData, 'group-box'>

/** Same rule as node labels: the chosen size, never below the touch minimum. */
const titleFont = (size: number | undefined) => `max(var(--cl-node-font-min), ${size ? `${size}px` : 'var(--text-node)'})`

/** Clicking a header or border selects the group (Shift/Cmd/Ctrl adds or removes it). */
function selectGroup(id: string, e: React.MouseEvent) {
  const store = useDiagramStore.getState()
  if (e.shiftKey || e.metaKey || e.ctrlKey) {
    const has = store.selection.includes(id)
    store.setSelection(has ? store.selection.filter((s) => s !== id) : [...store.selection, id])
  } else {
    store.setSelection([id])
  }
}

/**
 * A container, pool or lane, drawn behind nodes and edges. Only the header and
 * a thin border strip take pointer events (and drag the group); the body lets
 * clicks through to the canvas and to the nodes inside.
 */
export const GroupNode = memo(function GroupNode({ id, data }: NodeProps<GroupFlowNode>) {
  const { view, selected, dropTarget } = data
  const { group, side, header, locked } = view
  const lane = group.kind === 'lane'
  // Search: this collapsed group hides the current result.
  const found = useSearchStore((s) => currentTarget(s) === id)
  const titleRef = useRef<HTMLDivElement>(null)
  const [titleSize, setTitleSize] = useState(0)
  // Titles follow the diagram's font (and the group's own text style, if a file sets one).
  const defaults = useDiagramStore((s) => s.diagram.textDefaults)
  const title = titleText(group.style, defaults, 16)
  const fontReady = useFontReady(fontSpec(title))

  // Measure the title across the header's thickness, so a long title grows the header instead of spilling.
  useLayoutEffect(() => {
    const el = titleRef.current
    if (!el) return
    const measure = () => setTitleSize(side === 'left' ? el.offsetWidth : el.offsetHeight)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    document.fonts?.addEventListener('loadingdone', measure)
    return () => {
      observer.disconnect()
      document.fonts?.removeEventListener('loadingdone', measure)
    }
  }, [side])
  useEffect(() => {
    const needed = titleSize + 2 * readToken('--cl-node-padding', 8)
    if (fontReady && titleSize && needed > header) useDiagramStore.getState().growGroupHeader(id, needed)
  }, [id, titleSize, header, fontReady])

  const fill = resolveColour(group.style.fill, 'var(--cl-group-fill)')
  const border = resolveColour(group.style.stroke, 'var(--cl-group-border)')
  const grab = cn('cl-group-drag pointer-events-auto', locked ? 'cursor-default' : 'cursor-grab')
  const onClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    selectGroup(id, e)
  }

  return (
    <div className="relative h-full w-full">
      <NodeResizer
        isVisible={selected && !locked && !group.collapsed && !lane}
        minWidth={header + 60}
        minHeight={header + 60}
        handleClassName="cl-resize-handle"
        lineClassName="cl-resize-line"
        onResizeStart={startResize}
        onResizeEnd={endResize}
        // A pool grows from its far edges only, so its lanes (and their members) never shift.
        shouldResize={view.pool ? (_, p) => p.x === view.box.x && p.y === view.box.y : undefined}
      />
      {found && <div aria-hidden="true" className="pointer-events-none absolute -inset-2 rounded-lg border-2 border-(--cl-found) bg-(--cl-found-subtle)" />}
      <div
        className={cn('absolute inset-0 rounded-md border transition-colors', selected && 'border-2', dropTarget && 'border-2 border-accent bg-accent-subtle')}
        style={dropTarget ? undefined : { background: fill, borderColor: selected ? 'var(--cl-accent)' : border }}
      />
      {/* Header: title, collapse and lock. Its hit area is never under the touch target size. */}
      <div
        role="button"
        tabIndex={-1}
        aria-label={`${lane ? 'Lane' : 'Group'} ${group.label || 'untitled'}${locked ? ' (locked)' : ''}`}
        onClick={onClick}
        className={cn(
          grab,
          'absolute flex items-center gap-1 overflow-visible bg-(--cl-group-header) text-text',
          side === 'top' ? 'inset-x-0 top-0 rounded-t-md px-2' : 'inset-y-0 left-0 flex-col-reverse rounded-l-md py-2',
        )}
        style={side === 'top' ? { height: header, minHeight: 'var(--cl-touch-target)' } : { width: header, minWidth: 'var(--cl-touch-target)' }}
      >
        {group.kind === 'container' && !view.pool && (
          <button
            type="button"
            aria-label={group.collapsed ? 'Expand group' : 'Collapse group'}
            title={group.collapsed ? 'Expand' : 'Collapse'}
            onClick={(e) => {
              e.stopPropagation()
              useDiagramStore.getState().setCollapsed(id, !group.collapsed)
            }}
            className="nodrag flex size-touch shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-surface-muted"
          >
            {group.collapsed ? <ChevronRight className="size-5" /> : <ChevronDown className="size-5" />}
          </button>
        )}
        <div
          ref={titleRef}
          className={cn(
            'min-w-0 whitespace-pre-line',
            /\s/.test(group.label.trim()) ? 'wrap-break-word' : 'wrap-anywhere',
            side === 'left' ? 'rotate-180 [writing-mode:vertical-rl] text-center' : 'flex-1',
            !group.label && 'text-text-muted italic',
          )}
          style={{ ...textCss(title), textAlign: undefined, ...(!group.label && { fontStyle: 'italic' }), fontSize: titleFont(group.style.fontSize ?? defaults?.fontSize), lineHeight: 'var(--text-node--line-height)' }}
        >
          {group.label || (lane ? 'Lane' : 'Group')}
        </div>
        {locked && <Lock className="size-4 shrink-0 text-text-muted" aria-hidden="true" />}
      </div>
      {/* Thin grab strips along the other borders. */}
      {!group.collapsed &&
        (['top', 'right', 'bottom', 'left'] as const)
          .filter((edge) => edge !== side)
          .map((edge) => (
            <div
              key={edge}
              aria-hidden="true"
              onClick={onClick}
              className={cn(
                grab,
                'absolute',
                edge === 'top' && 'inset-x-0 top-0 h-(--cl-group-edge-hit)',
                edge === 'bottom' && 'inset-x-0 bottom-0 h-(--cl-group-edge-hit)',
                edge === 'left' && 'inset-y-0 left-0 w-(--cl-group-edge-hit)',
                edge === 'right' && 'inset-y-0 right-0 w-(--cl-group-edge-hit)',
              )}
            />
          ))}
    </div>
  )
})

