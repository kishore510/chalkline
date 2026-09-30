import { ArrowDown, ArrowUp, Circle, CircleDot, Eye, EyeOff, Layers, Lock, LockOpen, MoreHorizontal, Pencil, Plus, Trash2, View, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Panel } from '@/components/ui/panel'
import type { Layout } from '@/hooks/useMediaQuery'
import { cn } from '@/lib/utils'
import { DEFAULT_LAYER_ID, MAX_LAYERS, type DiagramLayer } from '@/schema/diagram'
import { useDiagramStore } from '@/store/diagramStore'
import { layerCounts, layerIdOf } from '@/store/layers'
import { useUiStore } from '@/store/uiStore'
import { reportLayerSwitch } from './layerNotices'

const store = () => useDiagramStore.getState()
const nameOf = (l: DiagramLayer) => l.name || 'Untitled layer'

/** Hidden and locked layer counts, for the toolbar indicator. */
export function useLayerStatus() {
  const hidden = useDiagramStore((s) => s.diagram.layers.filter((l) => !l.visible).length)
  const locked = useDiagramStore((s) => s.diagram.layers.filter((l) => l.locked).length)
  return { hidden, locked }
}

function RenameField({ layer, onDone }: { layer: DiagramLayer; onDone: () => void }) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])
  return (
    <input
      ref={ref}
      aria-label="Layer name"
      defaultValue={layer.name}
      maxLength={100}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') {
          e.currentTarget.value = layer.name
          e.currentTarget.blur()
        }
      }}
      onBlur={(e) => {
        const name = e.currentTarget.value.trim()
        if (name && name !== layer.name) store().renameLayer(layer.id, name)
        onDone()
      }}
      className="h-touch w-full min-w-0 rounded-md border border-focus bg-surface px-2 text-base text-text"
    />
  )
}

/** "Delete…": where this layer's items go, or delete them too. */
function DeletePanel({ layer, count, onDone }: { layer: DiagramLayer; count: number; onDone: () => void }) {
  const layers = useDiagramStore((s) => s.diagram.layers)
  const [target, setTarget] = useState(DEFAULT_LAYER_ID)
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-surface-muted p-3 text-sm">
      {count > 0 ? (
        <label className="flex flex-col gap-1.5 font-medium">
          Move its {count} {count === 1 ? 'item' : 'items'} to
          <select value={target} onChange={(e) => setTarget(e.target.value)} className="h-touch rounded-md border border-border-strong bg-surface px-3 text-base">
            {layers
              .filter((l) => l.id !== layer.id)
              .map((l) => (
                <option key={l.id} value={l.id}>
                  {nameOf(l)}
                </option>
              ))}
          </select>
        </label>
      ) : (
        <p>This layer is empty.</p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          onClick={() => {
            store().deleteLayer(layer.id, target)
            onDone()
          }}
        >
          <Trash2 />
          {count > 0 ? 'Move items and delete' : 'Delete layer'}
        </Button>
        {count > 0 && (
          <Button
            variant="secondary"
            className="text-danger"
            onClick={() => {
              store().deleteLayerWithContents(layer.id)
              onDone()
            }}
          >
            <Trash2 />
            Delete layer and contents
          </Button>
        )}
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

function LayerRow({ layer, index, total, count, active, hiddenFrames }: { layer: DiagramLayer; index: number; total: number; count: number; active: boolean; hiddenFrames: boolean }) {
  const [renaming, setRenaming] = useState(false)
  const [menu, setMenu] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const isDefault = layer.id === DEFAULT_LAYER_ID

  useEffect(() => {
    if (!menu) return
    const close = (e: PointerEvent) => !menuRef.current?.contains(e.target as Node) && setMenu(false)
    document.addEventListener('pointerdown', close, true)
    return () => document.removeEventListener('pointerdown', close, true)
  }, [menu])

  const item = (label: string, icon: React.ReactNode, run: () => void, disabled = false) => (
    <Button
      role="menuitem"
      variant="ghost"
      className="justify-start"
      disabled={disabled}
      onClick={() => {
        setMenu(false)
        run()
      }}
    >
      {icon}
      {label}
    </Button>
  )

  return (
    <li className={cn('flex flex-col gap-1 rounded-md border p-1', active ? 'border-accent bg-accent-subtle' : 'border-border')}>
      <div className="flex items-center gap-0.5">
        <Button
          variant="ghost"
          size="icon"
          aria-pressed={!layer.visible}
          aria-label={layer.visible ? `Hide ${nameOf(layer)}` : `Show ${nameOf(layer)}`}
          title={layer.visible ? 'Visible: tap to hide' : 'Hidden: tap to show'}
          onClick={() => reportLayerSwitch(store().setLayerVisible(layer.id, !layer.visible))}
        >
          {layer.visible ? <Eye /> : <EyeOff className="text-danger" />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-pressed={layer.locked}
          aria-label={layer.locked ? `Unlock ${nameOf(layer)}` : `Lock ${nameOf(layer)}`}
          title={layer.locked ? 'Locked: tap to unlock' : 'Unlocked: tap to lock'}
          onClick={() => reportLayerSwitch(store().setLayerLocked(layer.id, !layer.locked))}
        >
          {layer.locked ? <Lock /> : <LockOpen className="text-text-muted" />}
        </Button>
        <div className="min-w-0 flex-1">
          {renaming ? (
            <RenameField layer={layer} onDone={() => setRenaming(false)} />
          ) : (
            <button
              type="button"
              onClick={() => setRenaming(true)}
              title="Tap to rename"
              className="flex min-h-touch w-full min-w-0 flex-col items-start justify-center rounded-md px-2 text-left hover:bg-surface-muted"
            >
              <span className="w-full truncate text-sm font-medium">{nameOf(layer)}</span>
              <span className="text-xs text-text-muted">
                {count} {count === 1 ? 'item' : 'items'}
                {!layer.visible && ' · hidden'}
                {layer.locked && ' · locked'}
              </span>
            </button>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-pressed={active}
          aria-label={active ? `${nameOf(layer)} is the active layer` : `Add new items to ${nameOf(layer)}`}
          title={active ? 'Active: new items go here' : 'Make active'}
          onClick={() => store().setActiveLayer(layer.id)}
        >
          {active ? <CircleDot className="text-accent" /> : <Circle className="text-text-muted" />}
        </Button>
        <div className="relative" ref={menuRef}>
          <Button variant="ghost" size="icon" aria-label={`More for ${nameOf(layer)}`} aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((v) => !v)}>
            <MoreHorizontal />
          </Button>
          {menu && (
            <Panel role="menu" aria-label={`${nameOf(layer)} actions`} className="absolute top-full right-0 z-50 mt-1 flex w-52 flex-col p-1 shadow-lg">
              {item('Rename', <Pencil />, () => setRenaming(true))}
              {item('Move up', <ArrowUp />, () => store().moveLayer(layer.id, 1), index === total - 1)}
              {item('Move down', <ArrowDown />, () => store().moveLayer(layer.id, -1), index === 0)}
              {item('Show only this layer', <View />, () => reportLayerSwitch(store().soloLayer(layer.id)))}
              {!isDefault && item('Delete…', <Trash2 />, () => setDeleting(true))}
            </Panel>
          )}
        </div>
      </div>
      {active && <p className="px-2 text-xs font-medium text-accent">Active: new items go here</p>}
      {hiddenFrames && !layer.visible && (
        <p className="px-2 text-xs text-text-muted">Group frames on this layer are hidden; shapes inside them on other layers stay visible.</p>
      )}
      {deleting && <DeletePanel layer={layer} count={count} onDone={() => setDeleting(false)} />}
    </li>
  )
}

/** The list of layers (top of the stack first) with Add layer and Show all. */
export function LayersContent() {
  const diagram = useDiagramStore((s) => s.diagram)
  const active = useDiagramStore((s) => s.activeLayerId)
  const counts = layerCounts(diagram)
  const framed = new Set(diagram.groups.map((g) => layerIdOf(g)))
  const anyHidden = diagram.layers.some((l) => !l.visible)
  return (
    <div className="flex flex-col gap-3 pb-4">
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" disabled={diagram.layers.length >= MAX_LAYERS} onClick={() => store().addLayer()}>
          <Plus />
          Add layer
        </Button>
        <Button variant="secondary" disabled={!anyHidden} onClick={() => store().showAllLayers()}>
          <Eye />
          Show all
        </Button>
      </div>
      <ol aria-label="Layers, top first" className="flex flex-col gap-1.5">
        {[...diagram.layers].reverse().map((layer) => {
          const index = diagram.layers.indexOf(layer)
          return (
            <LayerRow
              key={layer.id}
              layer={layer}
              index={index}
              total={diagram.layers.length}
              count={counts.get(layer.id) ?? 0}
              active={layer.id === active}
              hiddenFrames={framed.has(layer.id)}
            />
          )
        })}
      </ol>
      <p className="text-xs text-text-muted">
        Higher layers draw on top. Hidden and locked states are saved with the diagram but aren’t undo steps.
      </p>
    </div>
  )
}

/** Toolbar button. Shows how many layers are hidden or locked, so nothing looks missing unexplained. */
export function LayersButton({ layout, className }: { layout: Layout; className?: string }) {
  const { hidden, locked } = useLayerStatus()
  const open = useUiStore((s) => s.layersOpen)
  const setOpen = useUiStore((s) => s.setLayersOpen)
  // Desktop: layers live in the right panel, which may be collapsed to a rail.
  const collapsed = useUiStore((s) => layout === 'desktop' && s.rightPanelCollapsed)
  const setCollapsed = useUiStore((s) => s.setRightPanelCollapsed)
  const status = [hidden && `${hidden} hidden`, locked && `${locked} locked`].filter(Boolean).join(', ')
  return (
    <Button
      variant="ghost"
      size={layout === 'desktop' ? 'default' : 'icon'}
      aria-pressed={open && !collapsed}
      aria-label={`Layers${status ? ` (${status})` : ''}`}
      title={status ? `Layers: ${status}` : 'Layers'}
      onClick={() => {
        if (collapsed) {
          setOpen(true)
          setCollapsed(false)
        } else setOpen(!open)
      }}
      className={cn('relative', className)}
    >
      <Layers />
      {layout === 'desktop' && 'Layers'}
      {(hidden > 0 || locked > 0) && (
        <span
          aria-hidden="true"
          className={cn(
            'flex items-center gap-0.5 rounded-full border border-border bg-surface px-1 text-xs font-semibold text-text shadow-sm',
            layout === 'desktop' ? '' : 'absolute -top-0.5 -right-0.5',
          )}
        >
          {hidden > 0 ? <EyeOff className="size-3" /> : <Lock className="size-3" />}
          {hidden + locked}
        </span>
      )}
    </Button>
  )
}

/** Phone and tablet: the layers panel as a bottom sheet. */
export function LayersSheet() {
  const open = useUiStore((s) => s.layersOpen)
  const setOpen = useUiStore((s) => s.setLayersOpen)
  if (!open) return null
  return (
    <Panel
      role="dialog"
      aria-label="Layers"
      className="cl-safe-bottom pointer-events-auto fixed inset-x-0 bottom-0 z-40 max-h-(--cl-drawer-max-height) overflow-y-auto rounded-b-none px-3 shadow-lg"
    >
      <div className="sticky top-0 z-10 -mx-3 flex min-h-touch items-center justify-between bg-surface pr-1 pl-3">
        <h2 className="text-sm font-semibold">Layers</h2>
        <Button variant="ghost" size="icon" aria-label="Close layers" onClick={() => setOpen(false)}>
          <X />
        </Button>
      </div>
      <LayersContent />
    </Panel>
  )
}
