import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  MoveHorizontal,
  MoveVertical,
  Scaling,
} from 'lucide-react'
import type { ReactNode } from 'react'
import type { AlignMode, Axis, MatchMode } from '@/canvas/arrange'
import { Button } from '@/components/ui/button'
import { Panel } from '@/components/ui/panel'
import { cn } from '@/lib/utils'
import { useDiagramStore } from '@/store/diagramStore'
import { useUiStore } from '@/store/uiStore'

interface Command {
  label: string
  /** Longer description for tooltips and screen readers. */
  title: string
  icon: ReactNode
  run: () => void
}

const store = () => useDiagramStore.getState()

/** Runs an arrange action and says if locked shapes were left out. */
function report({ skipped }: { skipped: number }) {
  if (skipped > 0) useUiStore.getState().notify(`Skipped ${skipped} locked ${skipped === 1 ? 'shape' : 'shapes'}.`)
}

const ALIGN: (Command & { mode: AlignMode })[] = [
  { mode: 'left', label: 'Left', title: 'Align left edges', icon: <AlignStartVertical />, run: () => report(store().alignSelection('left')) },
  { mode: 'centre', label: 'Centre', title: 'Align centres horizontally', icon: <AlignCenterVertical />, run: () => report(store().alignSelection('centre')) },
  { mode: 'right', label: 'Right', title: 'Align right edges', icon: <AlignEndVertical />, run: () => report(store().alignSelection('right')) },
  { mode: 'top', label: 'Top', title: 'Align top edges', icon: <AlignStartHorizontal />, run: () => report(store().alignSelection('top')) },
  { mode: 'middle', label: 'Middle', title: 'Align centres vertically', icon: <AlignCenterHorizontal />, run: () => report(store().alignSelection('middle')) },
  { mode: 'bottom', label: 'Bottom', title: 'Align bottom edges', icon: <AlignEndHorizontal />, run: () => report(store().alignSelection('bottom')) },
]

const DISTRIBUTE: (Command & { axis: Axis })[] = [
  {
    axis: 'horizontal',
    label: 'Across',
    title: 'Distribute horizontally (equal gaps)',
    icon: <AlignHorizontalDistributeCenter />,
    run: () => report(store().distributeSelection('horizontal')),
  },
  {
    axis: 'vertical',
    label: 'Down',
    title: 'Distribute vertically (equal gaps)',
    icon: <AlignVerticalDistributeCenter />,
    run: () => report(store().distributeSelection('vertical')),
  },
]

const MATCH: (Command & { mode: MatchMode })[] = [
  { mode: 'width', label: 'Width', title: 'Match the widest width', icon: <MoveHorizontal />, run: () => report(store().matchSizeSelection('width')) },
  { mode: 'height', label: 'Height', title: 'Match the tallest height', icon: <MoveVertical />, run: () => report(store().matchSizeSelection('height')) },
  { mode: 'both', label: 'Both', title: 'Match the largest width and height', icon: <Scaling />, run: () => report(store().matchSizeSelection('both')) },
]

/** Selected shapes (edges don't count), shown only in Select mode. */
function useArrangeState() {
  const count = useDiagramStore((s) => {
    const ids = new Set(s.selection)
    return s.diagram.nodes.reduce((n, node) => n + (ids.has(node.id) ? 1 : 0), 0)
  })
  const selectTool = useUiStore((s) => s.tool === 'select')
  return { count, visible: selectTool && count >= 2, canDistribute: count >= 3 }
}

const DISTRIBUTE_HINT = 'Select 3 or more shapes to distribute.'

/** Desktop: a compact icon bar floating at the top of the canvas. */
export function ArrangeBar() {
  const { visible, canDistribute } = useArrangeState()
  if (!visible) return null
  const group = (label: string, commands: Command[], disabled = false, hint?: string) => (
    <div role="group" aria-label={label} className="flex items-center gap-0.5">
      <span className="px-1.5 text-xs font-medium text-text-muted">{label}</span>
      {commands.map((c) => (
        <Button key={c.title} variant="ghost" size="icon" aria-label={c.title} title={disabled && hint ? hint : c.title} disabled={disabled} onClick={c.run}>
          {c.icon}
        </Button>
      ))}
    </div>
  )
  return (
    <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center px-4">
      <Panel role="toolbar" aria-label="Arrange shapes" className="pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-x-1 p-1 shadow-lg">
        {group('Align', ALIGN)}
        <div aria-hidden="true" className="mx-1 h-6 w-px bg-border" />
        {group('Distribute', DISTRIBUTE, !canDistribute, DISTRIBUTE_HINT)}
        <div aria-hidden="true" className="mx-1 h-6 w-px bg-border" />
        {group('Match size', MATCH)}
      </Panel>
    </div>
  )
}

function GridButton({ command, disabled }: { command: Command; disabled?: boolean }) {
  return (
    <Button
      variant="secondary"
      aria-label={command.title}
      title={command.title}
      disabled={disabled}
      onClick={command.run}
      className="h-auto min-h-touch flex-col gap-1 px-1 py-2 text-xs"
    >
      {command.icon}
      {command.label}
    </Button>
  )
}

/** Phone sheet and tablet slide-over: labelled buttons in the multi-select panel. */
export function ArrangeSection() {
  const { visible, canDistribute } = useArrangeState()
  if (!visible) return null
  const heading = (text: string) => <h3 className="text-xs font-semibold tracking-wide text-text-muted uppercase">{text}</h3>
  return (
    <section aria-label="Arrange shapes" className="flex flex-col gap-3">
      {heading('Align')}
      <div className="grid grid-cols-3 gap-2">
        {ALIGN.map((c) => (
          <GridButton key={c.mode} command={c} />
        ))}
      </div>
      {heading('Distribute')}
      <div className="grid grid-cols-2 gap-2">
        {DISTRIBUTE.map((c) => (
          <GridButton key={c.axis} command={c} disabled={!canDistribute} />
        ))}
      </div>
      {!canDistribute && <p className={cn('-mt-1 text-xs text-text-muted')}>{DISTRIBUTE_HINT}</p>}
      {heading('Match size')}
      <div className="grid grid-cols-3 gap-2">
        {MATCH.map((c) => (
          <GridButton key={c.mode} command={c} />
        ))}
      </div>
    </section>
  )
}
