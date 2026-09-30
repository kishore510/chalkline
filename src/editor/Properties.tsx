import { useReactFlow, useStoreApi } from '@xyflow/react'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, BetweenHorizontalEnd, BetweenHorizontalStart, CopyPlus, Group, LogOut, Pencil, RotateCcw, Trash2, Ungroup, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { revealViewport, selectionBounds } from '@/canvas/floating'
import { EDGE_DEFAULTS } from '@/canvas/flow'
import { HANDLE_SIDES, type HandleSide } from '@/canvas/handles'
import { ShapeIcon } from '@/components/shapes/ShapeIcon'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { readToken } from '@/lib/cssVar'
import { cn } from '@/lib/utils'
import type { DiagramEdge, DiagramGroup, DiagramNode, EdgeStyle, NodeStyle } from '@/schema/diagram'
import { MIN_NODE_SIZE } from '@/schema/factories'
import { useDiagramStore } from '@/store/diagramStore'
import { groupById, isGroupLocked, isNodeLocked, isPool, laneOrder, minLaneThickness } from '@/store/groups'
import type { StylePatch } from '@/store/ops'
import { useUiStore } from '@/store/uiStore'
import { MEDIA } from '@/styles/breakpoints'
import { ColourField, Section, SelectField, shared, TextAreaField, ToggleField, type Option, type Shared } from './fields'
import { ArrangeSection } from './ArrangeControls'
import { deleteSelectionWithNotice } from './deleteSelection'
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
      <GroupMembership node={node} />
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

/* ---------- Groups, lanes and locking ---------- */

/** Lock toggle for nodes or groups. Shows when a lock comes from an enclosing group instead. */
function LockField({ ids, locked, inherited }: { ids: string[]; locked: boolean; inherited: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <ToggleField label="Locked" pressed={locked} onChange={(value) => store().setLocked(ids, value)} />
      <p className="text-xs text-text-muted">
        {inherited && !locked
          ? 'Locked because its group is locked.'
          : 'A locked item can’t be moved, resized or deleted. Its label and notes stay editable.'}
      </p>
    </div>
  )
}

/** A shape's group, with a way out that doesn't depend on a precise drag, plus locking and grouping. */
function GroupMembership({ node }: { node: DiagramNode }) {
  const diagram = useDiagramStore((s) => s.diagram)
  const group = groupById(diagram, node.groupId)
  const lockedByGroup = isGroupLocked(diagram, group)
  return (
    <Section title="Group and lock">
      {group ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="min-w-0 truncate">
            In <span className="font-medium">{group.label || (group.kind === 'lane' ? 'a lane' : 'a group')}</span>
          </span>
          <Button variant="secondary" disabled={isNodeLocked(diagram, node)} onClick={() => store().removeFromGroup([node.id])}>
            <LogOut />
            Remove from group
          </Button>
        </div>
      ) : (
        <GroupButton />
      )}
      <LockField ids={[node.id]} locked={node.locked} inherited={lockedByGroup} />
    </Section>
  )
}

function GroupButton() {
  return (
    <Button
      variant="secondary"
      className="self-start"
      onClick={() => {
        if (!store().groupSelection()) useUiStore.getState().notify('Can’t group here: containers can’t go inside a lane.')
      }}
    >
      <Group />
      Group
    </Button>
  )
}

function GroupProperties({ group }: { group: DiagramGroup }) {
  const diagram = useDiagramStore((s) => s.diagram)
  const pool = isPool(diagram, group)
  const locked = isGroupLocked(diagram, group)
  const lanes = pool ? laneOrder(diagram, group.id) : []
  return (
    <>
      <TextAreaField label="Name" value={group.label} rows={1} onChange={(label) => store().setGroupLabel(group.id, label)} />
      <ToggleField label="Collapsed" pressed={group.collapsed} onChange={(collapsed) => store().setCollapsed(group.id, collapsed)} />
      <LockField ids={[group.id]} locked={group.locked} inherited={locked && !group.locked} />
      {pool && lanes.at(-1) && (
        <Button variant="secondary" className="self-start" disabled={locked} onClick={() => store().addLane(lanes.at(-1)!.id, 'after')}>
          <BetweenHorizontalEnd />
          Add lane
        </Button>
      )}
      <Section title="Remove">
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" disabled={locked} onClick={() => store().ungroup(group.id)}>
            <Ungroup />
            Ungroup
          </Button>
          <Button variant="secondary" disabled={locked} className="text-danger" onClick={() => store().deleteGroupsWithContents([group.id])}>
            <Trash2 />
            Delete group and contents
          </Button>
        </div>
        <p className="text-xs text-text-muted">Ungroup (or Delete) keeps the shapes inside. Delete group and contents removes them too; you can undo it.</p>
      </Section>
    </>
  )
}

function LaneProperties({ lane }: { lane: DiagramGroup }) {
  const diagram = useDiagramStore((s) => s.diagram)
  const locked = isGroupLocked(diagram, lane)
  const horizontal = (lane.orientation ?? 'horizontal') === 'horizontal'
  const order = lane.parentId ? laneOrder(diagram, lane.parentId) : []
  const index = order.findIndex((l) => l.id === lane.id)
  const thickness = horizontal ? lane.size.height : lane.size.width
  return (
    <>
      <TextAreaField label="Name" value={lane.label} rows={1} onChange={(label) => store().setGroupLabel(lane.id, label)} />
      <Label>
        {horizontal ? 'Height' : 'Width'}
        <LaneThickness key={thickness} lane={lane} value={thickness} disabled={locked} />
      </Label>
      <Section title="Lanes">
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" disabled={locked} onClick={() => store().addLane(lane.id, 'before')}>
            <BetweenHorizontalStart />
            Add before
          </Button>
          <Button variant="secondary" disabled={locked} onClick={() => store().addLane(lane.id, 'after')}>
            <BetweenHorizontalEnd />
            Add after
          </Button>
          <Button variant="secondary" disabled={locked || index <= 0} onClick={() => store().moveLane(lane.id, -1)}>
            {horizontal ? <ArrowUp /> : <ArrowLeft />}
            {horizontal ? 'Move up' : 'Move left'}
          </Button>
          <Button variant="secondary" disabled={locked || index === order.length - 1} onClick={() => store().moveLane(lane.id, 1)}>
            {horizontal ? <ArrowDown /> : <ArrowRight />}
            {horizontal ? 'Move down' : 'Move right'}
          </Button>
        </div>
        <Button variant="secondary" disabled={locked} className="self-start text-danger" onClick={() => store().deleteLane(lane.id)}>
          <Trash2 />
          Delete lane
        </Button>
        <p className="text-xs text-text-muted">Deleting a lane keeps its shapes; they stay in the pool.</p>
      </Section>
      <LockField ids={[lane.id]} locked={lane.locked} inherited={locked && !lane.locked} />
    </>
  )
}

/** Lane thickness, committed on blur or Enter, never thinner than the lane's shapes. */
function LaneThickness({ lane, value, disabled }: { lane: DiagramGroup; value: number; disabled: boolean }) {
  const [draft, setDraft] = useState(String(Math.round(value)))
  const commit = () => {
    const n = Number(draft)
    if (Number.isFinite(n)) store().setLaneThickness(lane.id, n)
    else setDraft(String(Math.round(value)))
  }
  const min = Math.round(minLaneThickness(useDiagramStore.getState().diagram, lane))
  return (
    <Input
      type="number"
      inputMode="numeric"
      min={min}
      value={draft}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && commit()}
      className="tabular-nums"
    />
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
  | { kind: 'group'; title: string; group: DiagramGroup }
  | { kind: 'mixed'; title: string }

function useSelectionSummary(): Summary {
  const selection = useDiagramStore((s) => s.selection)
  const diagram = useDiagramStore((s) => s.diagram)
  const ids = new Set(selection)
  const nodes = diagram.nodes.filter((n) => ids.has(n.id))
  const edges = diagram.edges.filter((e) => ids.has(e.id))
  const groups = diagram.groups.filter((g) => ids.has(g.id))
  if (groups.length === 1 && nodes.length + edges.length === 0) {
    const group = groups[0]!
    return { kind: 'group', title: group.kind === 'lane' ? 'Lane' : isPool(diagram, group) ? 'Pool' : 'Group', group }
  }
  if (groups.length > 0) return { kind: 'mixed', title: `${nodes.length + edges.length + groups.length} selected` }
  if (nodes.length + edges.length === 0) return { kind: 'none', title: 'Diagram' }
  if (nodes.length === 1 && edges.length === 0) return { kind: 'node', title: SHAPE_NAMES[nodes[0]!.type], node: nodes[0]! }
  if (edges.length === 1 && nodes.length === 0) return { kind: 'edge', title: 'Connector', edge: edges[0]! }
  if (edges.length === 0) return { kind: 'nodes', title: `${nodes.length} shapes`, nodes }
  if (nodes.length === 0) return { kind: 'edges', title: `${edges.length} connectors`, edges }
  return { kind: 'mixed', title: `${nodes.length + edges.length} selected` }
}

/** `arrange`: show align/distribute buttons for multi-selections (phone and tablet; desktop has its bar). */
function PropertiesBody({ summary, arrange = false }: { summary: Summary; arrange?: boolean }) {
  return (
    <div className="flex flex-col gap-4 pb-4">
      {arrange && (summary.kind === 'nodes' || summary.kind === 'mixed') && <ArrangeSection />}
      {summary.kind === 'none' && <DiagramProperties />}
      {summary.kind === 'node' && <NodeProperties node={summary.node} />}
      {summary.kind === 'edge' && <EdgeProperties edge={summary.edge} />}
      {summary.kind === 'nodes' && (
        <>
          <GroupButton />
          <NodeStyleSection nodes={summary.nodes} />
          <LockField ids={summary.nodes.map((n) => n.id)} locked={summary.nodes.every((n) => n.locked)} inherited={false} />
        </>
      )}
      {summary.kind === 'group' && (summary.group.kind === 'lane' ? <LaneProperties lane={summary.group} /> : <GroupProperties group={summary.group} />)}
      {summary.kind === 'edges' && (
        <>
          <ConnectionSection edges={summary.edges} />
          <EdgeStyleSection edges={summary.edges} />
        </>
      )}
      {summary.kind === 'mixed' && <p className="text-sm text-text-muted">Select only shapes or only connectors to style them together. Arranging ignores connectors.</p>}
    </div>
  )
}

function Header({ summary, onClose }: { summary: Summary; onClose?: () => void }) {
  return (
    <div className="flex min-h-touch items-center gap-1">
      {summary.kind === 'node' && <ShapeIcon type={summary.node.type} className="mr-1 size-5 shrink-0 text-text-muted" />}
      <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">{summary.title}</h2>
      {(summary.kind === 'node' || summary.kind === 'nodes' || (summary.kind === 'group' && summary.group.kind === 'container')) && (
        <Button variant="ghost" size="icon" aria-label="Duplicate" title="Duplicate (Ctrl D)" onClick={() => store().duplicateSelection()}>
          <CopyPlus />
        </Button>
      )}
      {summary.kind !== 'none' && !(summary.kind === 'group' && summary.group.kind === 'lane') && (
        <Button
          variant="ghost"
          size="icon"
          // Deleting a group keeps its contents; "Delete group and contents" is in the panel.
          aria-label={summary.kind === 'group' ? 'Ungroup (keep contents)' : 'Delete selection'}
          title={summary.kind === 'group' ? 'Ungroup (keeps contents)' : 'Delete (Del)'}
          onClick={deleteSelectionWithNotice}
          className="text-danger"
        >
          {summary.kind === 'group' ? <Ungroup /> : <Trash2 />}
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
      <PropertiesBody summary={summary} arrange />
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
      <PropertiesBody summary={summary} arrange />
    </section>
  )
}
