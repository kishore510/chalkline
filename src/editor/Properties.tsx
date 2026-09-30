import { useReactFlow, useStoreApi } from '@xyflow/react'
import { ArrowRight, CopyPlus, Pencil, RotateCcw, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { revealViewport, selectionBounds } from '@/canvas/floating'
import { EDGE_DEFAULTS } from '@/canvas/flow'
import { HANDLE_SIDES, type HandleSide } from '@/canvas/handles'
import { ShapeIcon } from '@/components/shapes/ShapeIcon'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { readToken } from '@/lib/cssVar'
import { cn } from '@/lib/utils'
import type { DiagramEdge, DiagramNode, EdgeStyle, NodeStyle } from '@/schema/diagram'
import { MIN_NODE_SIZE } from '@/schema/factories'
import { useDiagramStore } from '@/store/diagramStore'
import type { StylePatch } from '@/store/ops'
import { useUiStore } from '@/store/uiStore'
import { MEDIA } from '@/styles/breakpoints'
import { ColourField, Section, SelectField, shared, TextAreaField, ToggleField, type Option, type Shared } from './fields'
import { SHAPE_NAMES } from './palette'

const store = () => useDiagramStore.getState()

/* ---------- Options ---------- */

const BORDER_WIDTHS: Option<number>[] = [
  { value: 0, label: 'None' },
  { value: 1, label: 'Thin' },
  { value: 2, label: 'Medium' },
  { value: 3, label: 'Thick' },
  { value: 5, label: 'Heavy' },
]
const FONT_SIZES: Option<number>[] = [10, 12, 14, 16, 20, 24, 32, 48].map((px) => ({ value: px, label: `${px} px` }))
const LINE_TYPES: Option<NonNullable<EdgeStyle['lineType']>>[] = [
  { value: 'straight', label: 'Straight' },
  { value: 'step', label: 'Right angles' },
  { value: 'smoothstep', label: 'Rounded corners' },
  { value: 'bezier', label: 'Curved' },
]
const ARROWS: Option<NonNullable<EdgeStyle['endArrow']>>[] = [
  { value: 'none', label: 'None' },
  { value: 'arrow', label: 'Open arrow' },
  { value: 'closed', label: 'Filled arrow' },
]
const EDGE_WIDTHS: Option<number>[] = [
  { value: 1, label: 'Thin' },
  { value: 2, label: 'Medium' },
  { value: 3, label: 'Thick' },
  { value: 5, label: 'Heavy' },
]
const SIDES: Option<HandleSide>[] = HANDLE_SIDES.map((side) => ({ value: side, label: side[0]!.toUpperCase() + side.slice(1) }))
const labelOf = <T,>(options: Option<T>[], value: T) => options.find((o) => o.value === value)?.label ?? String(value)

/* ---------- Small pieces ---------- */

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

// Focus requests (double-click on an edge, "Edit label" in the menu) are
// handled once, even if the field mounts after the request was made.
let handledFocusRequest = 0

function useLabelFocus() {
  const request = useUiStore((s) => s.focusLabelRequest)
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    if (request > handledFocusRequest && ref.current) {
      handledFocusRequest = request
      ref.current.focus()
      ref.current.select()
    }
  }, [request])
  return ref
}

function ResetButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="ghost" onClick={onClick} className="self-start px-3 text-text-muted">
      <RotateCcw />
      Reset to default
    </Button>
  )
}

/* ---------- Style sections (work on one or many) ---------- */

function NodeStyleSection({ nodes }: { nodes: DiagramNode[] }) {
  const ids = nodes.map((n) => n.id)
  const set = (patch: StylePatch<NodeStyle>) => store().updateNodeStyles(ids, patch)
  const get = <K extends keyof NodeStyle>(key: K): Shared<NonNullable<NodeStyle[K]>> => shared(nodes, (n) => n.style[key] as NonNullable<NodeStyle[K]>)
  const hasStyle = nodes.some((n) => Object.keys(n.style).length > 0)
  return (
    <Section title="Style">
      <ColourField label="Fill" variant="soft" defaultColour="var(--cl-node-fill)" value={get('fill')} onChange={(fill) => set({ fill })} />
      <ColourField label="Border" variant="strong" defaultColour="var(--cl-node-stroke)" value={get('stroke')} onChange={(stroke) => set({ stroke })} />
      <ColourField
        label="Text"
        variant="strong"
        defaultColour="var(--cl-node-text)"
        value={get('textColour')}
        onChange={(textColour) => set({ textColour })}
      />
      <div className="flex gap-3">
        <SelectField label="Border width" value={get('strokeWidth')} options={BORDER_WIDTHS} onChange={(strokeWidth) => set({ strokeWidth })} />
        <SelectField label="Text size" value={get('fontSize')} options={FONT_SIZES} onChange={(fontSize) => set({ fontSize })} />
      </div>
      {hasStyle && <ResetButton onClick={() => store().resetNodeStyles(ids)} />}
    </Section>
  )
}

function EdgeStyleSection({ edges }: { edges: DiagramEdge[] }) {
  const ids = edges.map((e) => e.id)
  const set = (patch: StylePatch<EdgeStyle>) => store().updateEdgeStyles(ids, patch)
  const get = <K extends keyof EdgeStyle>(key: K): Shared<NonNullable<EdgeStyle[K]>> => shared(edges, (e) => e.style[key] as NonNullable<EdgeStyle[K]>)
  const hasStyle = edges.some((e) => Object.keys(e.style).length > 0)
  return (
    <Section title="Line">
      <SelectField
        label="Shape"
        value={get('lineType')}
        options={LINE_TYPES}
        defaultLabel={`Default (${labelOf(LINE_TYPES, EDGE_DEFAULTS.lineType).toLowerCase()})`}
        onChange={(lineType) => set({ lineType })}
      />
      <div className="flex gap-3">
        <SelectField label="Start" value={get('startArrow')} options={ARROWS} fallback={EDGE_DEFAULTS.startArrow} onChange={(startArrow) => set({ startArrow })} />
        <SelectField label="End" value={get('endArrow')} options={ARROWS} fallback={EDGE_DEFAULTS.endArrow} onChange={(endArrow) => set({ endArrow })} />
      </div>
      <ToggleField label="Dashed" pressed={get('dashed')} onChange={(dashed) => set({ dashed: dashed || undefined })} />
      <ColourField label="Colour" variant="strong" defaultColour="var(--cl-edge)" value={get('colour')} onChange={(colour) => set({ colour })} />
      <SelectField label="Width" value={get('width')} options={EDGE_WIDTHS} onChange={(width) => set({ width })} />
      {hasStyle && <ResetButton onClick={() => store().resetEdgeStyles(ids)} />}
    </Section>
  )
}

/** Stored handle ids that aren't a side (e.g. from a hand-edited file) show as Auto. */
const sideOf = (handle: string | undefined): HandleSide | undefined => (HANDLE_SIDES.includes(handle as HandleSide) ? (handle as HandleSide) : undefined)

function ConnectionSection({ edges }: { edges: DiagramEdge[] }) {
  const ids = edges.map((e) => e.id)
  const pinned = edges.some((e) => e.sourceHandle !== undefined || e.targetHandle !== undefined)
  return (
    <Section title="Connection">
      <div className="flex gap-3">
        <SelectField<HandleSide>
          label="Start side"
          value={shared(edges, (e) => sideOf(e.sourceHandle))}
          options={SIDES}
          defaultLabel="Auto"
          onChange={(side) => store().setEdgeSides(ids, { source: side ?? null })}
        />
        <SelectField<HandleSide>
          label="End side"
          value={shared(edges, (e) => sideOf(e.targetHandle))}
          options={SIDES}
          defaultLabel="Auto"
          onChange={(side) => store().setEdgeSides(ids, { target: side ?? null })}
        />
      </div>
      <p className="text-xs text-text-muted">Auto attaches to the nearest side as shapes move. A chosen side stays put.</p>
      {pinned && (
        <Button variant="ghost" onClick={() => store().resetEdgeSides(ids)} className="self-start px-3 text-text-muted">
          <RotateCcw />
          Reset to auto
        </Button>
      )}
    </Section>
  )
}

/* ---------- Bodies ---------- */

const NODE_NOTES_HINT = 'Notes show as a small note badge on the shape, not as text on the canvas.'
const EDGE_NOTES_HINT = 'Notes are saved with the diagram but not drawn on the canvas.'

function NodeProperties({ node }: { node: DiagramNode }) {
  return (
    <>
      <TextAreaField label="Label" value={node.label} onChange={(label) => store().setNodeLabel(node.id, label)} />
      <Button variant="secondary" className="self-start" onClick={() => useUiStore.getState().setEditing(node.id)}>
        <Pencil />
        Edit on canvas
      </Button>
      <TextAreaField
        label="Notes"
        value={node.notes}
        rows={3}
        placeholder="Add a note…"
        hint={NODE_NOTES_HINT}
        onChange={(notes) => store().setNodeNotes(node.id, notes)}
      />
      <NodeStyleSection nodes={[node]} />
      <Section title="Size">
        <div className="flex gap-3">
          <SizeField label="Width" value={node.size.width} onCommit={(width) => store().resizeNode(node.id, { ...node.size, width })} />
          <SizeField label="Height" value={node.size.height} onCommit={(height) => store().resizeNode(node.id, { ...node.size, height })} />
        </div>
      </Section>
    </>
  )
}

function EdgeProperties({ edge }: { edge: DiagramEdge }) {
  const nodes = useDiagramStore((s) => s.diagram.nodes)
  const labelRef = useLabelFocus()
  const name = (id: string) => nodes.find((n) => n.id === id)?.label || 'Untitled'
  return (
    <>
      <div className="flex min-w-0 items-center gap-2 text-sm">
        <span className="truncate font-medium">{name(edge.source)}</span>
        <ArrowRight className="size-4 shrink-0 text-text-muted" aria-label="to" />
        <span className="truncate font-medium">{name(edge.target)}</span>
      </div>
      <TextAreaField
        label="Label"
        value={edge.label}
        rows={1}
        placeholder="e.g. HTTPS, reads, publishes"
        inputRef={labelRef}
        onChange={(label) => store().setEdgeLabel(edge.id, label)}
      />
      <TextAreaField
        label="Notes"
        value={edge.notes}
        rows={3}
        placeholder="Add a note…"
        hint={EDGE_NOTES_HINT}
        onChange={(notes) => store().setEdgeNotes(edge.id, notes)}
      />
      <ConnectionSection edges={[edge]} />
      <EdgeStyleSection edges={[edge]} />
    </>
  )
}

function DiagramProperties() {
  const title = useDiagramStore((s) => s.diagram.meta.title)
  const counts = useDiagramStore((s) => `${s.diagram.nodes.length} shapes, ${s.diagram.edges.length} connectors`)
  return (
    <>
      <Label>
        Diagram title
        <Input value={title} onChange={(e) => store().setTitle(e.target.value)} />
      </Label>
      <p className="text-sm text-text-muted">{counts}</p>
      <p className="text-sm text-text-muted">Select a shape or connector to style it and add notes.</p>
    </>
  )
}

type Summary =
  | { kind: 'none'; title: string }
  | { kind: 'node'; title: string; node: DiagramNode }
  | { kind: 'edge'; title: string; edge: DiagramEdge }
  | { kind: 'nodes'; title: string; nodes: DiagramNode[] }
  | { kind: 'edges'; title: string; edges: DiagramEdge[] }
  | { kind: 'mixed'; title: string }

function useSelectionSummary(): Summary {
  const selection = useDiagramStore((s) => s.selection)
  const diagram = useDiagramStore((s) => s.diagram)
  const ids = new Set(selection)
  const nodes = diagram.nodes.filter((n) => ids.has(n.id))
  const edges = diagram.edges.filter((e) => ids.has(e.id))
  if (nodes.length + edges.length === 0) return { kind: 'none', title: 'Diagram' }
  if (nodes.length === 1 && edges.length === 0) return { kind: 'node', title: SHAPE_NAMES[nodes[0]!.type], node: nodes[0]! }
  if (edges.length === 1 && nodes.length === 0) return { kind: 'edge', title: 'Connector', edge: edges[0]! }
  if (edges.length === 0) return { kind: 'nodes', title: `${nodes.length} shapes`, nodes }
  if (nodes.length === 0) return { kind: 'edges', title: `${edges.length} connectors`, edges }
  return { kind: 'mixed', title: `${nodes.length + edges.length} selected` }
}

function PropertiesBody({ summary }: { summary: Summary }) {
  return (
    <div className="flex flex-col gap-4 pb-4">
      {summary.kind === 'none' && <DiagramProperties />}
      {summary.kind === 'node' && <NodeProperties node={summary.node} />}
      {summary.kind === 'edge' && <EdgeProperties edge={summary.edge} />}
      {summary.kind === 'nodes' && <NodeStyleSection nodes={summary.nodes} />}
      {summary.kind === 'edges' && (
        <>
          <ConnectionSection edges={summary.edges} />
          <EdgeStyleSection edges={summary.edges} />
        </>
      )}
      {summary.kind === 'mixed' && <p className="text-sm text-text-muted">Select only shapes or only connectors to style them together.</p>}
    </div>
  )
}

function Header({ summary, onClose }: { summary: Summary; onClose?: () => void }) {
  return (
    <div className="flex min-h-touch items-center gap-1">
      {summary.kind === 'node' && <ShapeIcon type={summary.node.type} className="mr-1 size-5 shrink-0 text-text-muted" />}
      <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">{summary.title}</h2>
      {(summary.kind === 'node' || summary.kind === 'nodes') && (
        <Button variant="ghost" size="icon" aria-label="Duplicate" title="Duplicate (Ctrl D)" onClick={() => store().duplicateSelection()}>
          <CopyPlus />
        </Button>
      )}
      {summary.kind !== 'none' && (
        <Button variant="ghost" size="icon" aria-label="Delete selection" title="Delete (Del)" onClick={() => store().deleteSelection()} className="text-danger">
          <Trash2 />
        </Button>
      )}
      {onClose && (
        <Button variant="ghost" size="icon" aria-label="Close properties" onClick={onClose}>
          <X />
        </Button>
      )}
    </div>
  )
}

const clearSelection = () => store().setSelection([])

/** Desktop: persistent right panel. */
export function PropertiesPanel() {
  const summary = useSelectionSummary()
  return (
    <aside aria-label="Properties" className="flex w-properties shrink-0 flex-col overflow-y-auto border-l border-border bg-surface px-4">
      <Header summary={summary} />
      <PropertiesBody summary={summary} />
    </aside>
  )
}

/** Tablet: slides over the canvas from the right while something is selected. */
export function PropertiesSlideOver() {
  const summary = useSelectionSummary()
  const open = summary.kind !== 'none'
  return (
    <aside
      aria-label="Properties"
      aria-hidden={!open}
      inert={!open}
      className={cn(
        'absolute inset-y-0 right-0 z-20 flex w-properties flex-col overflow-y-auto border-l border-border bg-surface px-4 shadow-lg',
        'transition-transform duration-(--cl-duration-base) ease-standard',
        open ? 'translate-x-0' : 'translate-x-full',
      )}
    >
      <Header summary={summary} onClose={clearSelection} />
      <PropertiesBody summary={summary} />
    </aside>
  )
}

/** Pans the canvas so the selection sits in the visible area above the sheet, whenever either changes. */
function useRevealAboveSheet(sheet: React.RefObject<HTMLElement | null>) {
  const flow = useReactFlow()
  const rfStore = useStoreApi()
  const selectionKey = useDiagramStore((s) => s.selection.join(' '))

  useEffect(() => {
    const el = sheet.current
    if (!el) return
    const reveal = () => {
      const canvas = rfStore.getState().domNode?.getBoundingClientRect()
      const { diagram, selection } = useDiagramStore.getState()
      const bounds = selectionBounds(diagram, selection)
      if (!canvas || !bounds) return
      const visible = { width: canvas.width, height: Math.max(0, el.getBoundingClientRect().top - canvas.top) }
      const next = revealViewport(bounds, flow.getViewport(), visible, readToken('--cl-gutter', 16))
      const duration = window.matchMedia(MEDIA.reducedMotion).matches ? 0 : readToken('--cl-duration-base', 200)
      if (next) void flow.setViewport(next, { duration })
    }
    reveal()
    const observer = new ResizeObserver(reveal)
    observer.observe(el)
    return () => observer.disconnect()
  }, [sheet, flow, rfStore, selectionKey])
}

/** Phone: scrollable bottom sheet, shown while something is selected. */
export function PropertiesSheet() {
  const summary = useSelectionSummary()
  const ref = useRef<HTMLElement>(null)
  useRevealAboveSheet(ref)
  return (
    <section
      ref={ref}
      aria-label="Properties"
      className="cl-safe-bottom pointer-events-auto max-h-(--cl-sheet-max-height) w-full overflow-y-auto overscroll-contain rounded-t-lg border-t border-border bg-surface px-4 shadow-lg"
    >
      <div className="sticky top-0 z-10 -mx-4 bg-surface px-4">
        <div className="flex justify-center pt-2" aria-hidden="true">
          <div className="h-1 w-10 rounded-full bg-border-strong" />
        </div>
        <Header summary={summary} onClose={clearSelection} />
      </div>
      <PropertiesBody summary={summary} />
    </section>
  )
}
