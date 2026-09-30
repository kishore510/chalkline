import { ArrowRight, Pencil, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ShapeIcon } from '@/components/shapes/ShapeIcon'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { DiagramEdge, DiagramNode } from '@/schema/diagram'
import { MIN_NODE_SIZE } from '@/schema/factories'
import { useDiagramStore } from '@/store/diagramStore'
import { useUiStore } from '@/store/uiStore'
import { SHAPE_NAMES } from './palette'

/** Number input that only writes valid values back, on blur or Enter. */
function SizeField({ label, value, onCommit }: { label: string; value: number; onCommit: (value: number) => void }) {
  const [draft, setDraft] = useState(String(Math.round(value)))
  useEffect(() => setDraft(String(Math.round(value))), [value])
  const commit = () => {
    const n = Number(draft)
    if (Number.isFinite(n) && n >= MIN_NODE_SIZE) onCommit(n)
    else setDraft(String(Math.round(value)))
  }
  return (
    <Label className="min-w-0 flex-1">
      {label}
      <Input
        type="number"
        inputMode="numeric"
        min={MIN_NODE_SIZE}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
        className="tabular-nums"
      />
    </Label>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-text-muted">{label}</span>
      <span className="flex min-w-0 items-center gap-2 font-medium">{children}</span>
    </div>
  )
}

function DeleteButton({ label = 'Delete' }: { label?: string }) {
  const deleteSelection = useDiagramStore((s) => s.deleteSelection)
  return (
    <Button variant="secondary" onClick={deleteSelection} className="text-danger">
      <Trash2 />
      {label}
    </Button>
  )
}

function NodeProperties({ node, compact }: { node: DiagramNode; compact: boolean }) {
  const setNodeLabel = useDiagramStore((s) => s.setNodeLabel)
  const resizeNode = useDiagramStore((s) => s.resizeNode)
  return (
    <>
      <Label>
        Label
        <textarea
          value={node.label}
          onChange={(e) => setNodeLabel(node.id, e.target.value)}
          rows={compact ? 1 : 3}
          className="min-h-touch w-full resize-y rounded-md border border-border-strong bg-surface px-3 py-2.5 text-base text-text transition-colors focus-visible:border-focus"
        />
      </Label>
      {!compact && (
        <>
          <Field label="Shape">
            <ShapeIcon type={node.type} className="size-5 text-text-muted" />
            {SHAPE_NAMES[node.type]}
          </Field>
          <div className="flex gap-3">
            <SizeField label="Width" value={node.size.width} onCommit={(width) => resizeNode(node.id, { ...node.size, width })} />
            <SizeField label="Height" value={node.size.height} onCommit={(height) => resizeNode(node.id, { ...node.size, height })} />
          </div>
        </>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => useUiStore.getState().setEditing(node.id)}>
          <Pencil />
          Edit on canvas
        </Button>
        <DeleteButton />
      </div>
    </>
  )
}

function EdgeProperties({ edge }: { edge: DiagramEdge }) {
  const nodes = useDiagramStore((s) => s.diagram.nodes)
  const name = (id: string) => nodes.find((n) => n.id === id)?.label || 'Untitled'
  return (
    <>
      <Field label="Connects">
        <span className="truncate">{name(edge.source)}</span>
        <ArrowRight className="size-4 shrink-0 text-text-muted" aria-label="to" />
        <span className="truncate">{name(edge.target)}</span>
      </Field>
      <div>
        <DeleteButton />
      </div>
    </>
  )
}

function DiagramProperties() {
  const title = useDiagramStore((s) => s.diagram.meta.title)
  const counts = useDiagramStore((s) => `${s.diagram.nodes.length} shapes, ${s.diagram.edges.length} connectors`)
  const setTitle = useDiagramStore((s) => s.setTitle)
  return (
    <>
      <Label>
        Diagram title
        <Input value={title} onChange={(e) => setTitle(e.target.value)} />
      </Label>
      <p className="text-sm text-text-muted">{counts}</p>
      <p className="text-sm text-text-muted">Select a shape or connector to see its properties.</p>
    </>
  )
}

/** What the properties panel shows for the current selection. */
function useSelectionSummary() {
  const selection = useDiagramStore((s) => s.selection)
  const diagram = useDiagramStore((s) => s.diagram)
  if (selection.length === 0) return { kind: 'none' as const, title: 'Diagram' }
  if (selection.length > 1) return { kind: 'many' as const, title: `${selection.length} selected` }
  const node = diagram.nodes.find((n) => n.id === selection[0])
  if (node) return { kind: 'node' as const, title: SHAPE_NAMES[node.type], node }
  const edge = diagram.edges.find((e) => e.id === selection[0])
  if (edge) return { kind: 'edge' as const, title: 'Connector', edge }
  return { kind: 'none' as const, title: 'Diagram' }
}

function PropertiesBody({ compact = false }: { compact?: boolean }) {
  const summary = useSelectionSummary()
  return (
    <div className="flex flex-col gap-4">
      {summary.kind === 'none' && <DiagramProperties />}
      {summary.kind === 'many' && <DeleteButton label="Delete all" />}
      {summary.kind === 'node' && <NodeProperties node={summary.node} compact={compact} />}
      {summary.kind === 'edge' && <EdgeProperties edge={summary.edge} />}
    </div>
  )
}

function Header({ onClose }: { onClose?: () => void }) {
  const { title } = useSelectionSummary()
  return (
    <div className="flex min-h-touch items-center justify-between gap-2">
      <h2 className="truncate text-sm font-semibold">{title}</h2>
      {onClose && (
        <Button variant="ghost" size="icon" aria-label="Close properties" onClick={onClose}>
          <X />
        </Button>
      )}
    </div>
  )
}

const clearSelection = () => useDiagramStore.getState().setSelection([])

/** Desktop: persistent right panel. */
export function PropertiesPanel() {
  return (
    <aside aria-label="Properties" className="flex w-properties shrink-0 flex-col gap-2 overflow-y-auto border-l border-border bg-surface px-4 pb-4">
      <Header />
      <PropertiesBody />
    </aside>
  )
}

/** Tablet: slides over the canvas from the right while something is selected. */
export function PropertiesSlideOver() {
  const open = useDiagramStore((s) => s.selection.length > 0)
  return (
    <aside
      aria-label="Properties"
      aria-hidden={!open}
      inert={!open}
      className={cn(
        'absolute inset-y-0 right-0 z-20 flex w-properties flex-col gap-2 overflow-y-auto border-l border-border bg-surface px-4 pb-4 shadow-lg',
        'transition-transform duration-(--cl-duration-base) ease-standard',
        open ? 'translate-x-0' : 'translate-x-full',
      )}
    >
      <Header onClose={clearSelection} />
      <PropertiesBody />
    </aside>
  )
}

/** Phone: compact bottom sheet, shown while something is selected. */
export function PropertiesSheet() {
  return (
    <section
      aria-label="Properties"
      className="cl-safe-bottom pointer-events-auto max-h-(--cl-sheet-max-height) w-full overflow-y-auto rounded-t-lg border-t border-border bg-surface px-4 shadow-lg"
    >
      <div className="flex justify-center pt-2" aria-hidden="true">
        <div className="h-1 w-10 rounded-full bg-border-strong" />
      </div>
      <Header onClose={clearSelection} />
      <PropertiesBody compact />
    </section>
  )
}
