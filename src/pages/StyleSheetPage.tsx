import {
  Copy,
  Hand,
  Layers,
  MousePointer2,
  Plus,
  Redo2,
  Search,
  Trash2,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { EmptyState } from '@/components/EmptyState'
import { Logo } from '@/components/Logo'
import { ShapeIcon } from '@/components/shapes/ShapeIcon'
import { ShapeView } from '@/components/shapes/ShapeView'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { Panel, PanelBody, PanelHeader, PanelTitle } from '@/components/ui/panel'
import { Segmented } from '@/components/ui/segmented'
import { COLOUR_PRESETS, PRESET_NAMES, presetToken } from '@/lib/colour'
import { cn } from '@/lib/utils'
import { nodeAppearance } from '@/canvas/appearance'
import type { NodeType } from '@/schema/diagram'
import { getShape, SHAPES } from '@/shapes/registry'

const COLOUR_TOKENS = [
  'bg',
  'canvas',
  'grid',
  'surface',
  'surface-muted',
  'border',
  'border-strong',
  'text',
  'text-muted',
  'accent',
  'accent-hover',
  'accent-subtle',
  'on-accent',
  'focus',
  'danger',
  'on-danger',
  'node-fill',
  'node-stroke',
  'node-text',
  'edge',
] as const

const TYPE_SCALE = [
  ['text-2xl', 'Heading 2xl'],
  ['text-xl', 'Heading xl'],
  ['text-lg', 'Heading lg'],
  ['text-base', 'Body base'],
  ['text-sm', 'Body sm, controls'],
  ['text-node', 'Node label'],
  ['text-xs', 'Caption xs'],
] as const

type Tool = 'select' | 'pan'
const TOOL_OPTIONS = [
  { value: 'select' as const, label: 'Select and move', icon: <MousePointer2 /> },
  { value: 'pan' as const, label: 'Pan', icon: <Hand /> },
]

function Section({ id, title, description, children }: { id: string; title: string; description?: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id={id} className="text-xl font-semibold tracking-tight">
          {title}
        </h2>
        {description && <p className="text-sm text-text-muted">{description}</p>}
      </div>
      {children}
    </section>
  )
}

/** A short horizontal connector with an arrowhead, drawn in the edge token. */
function EdgePreview({ width = 48 }: { width?: number }) {
  return (
    <svg width={width} height={16} viewBox={`0 0 ${width} 16`} aria-hidden="true" className="shrink-0 overflow-visible">
      <path d={`M2 8H${width - 3}`} className="cl-edge-stroke stroke-edge" />
      <path d={`M${width - 9} 3L${width - 2} 8L${width - 9} 13Z`} className="fill-edge stroke-edge cl-edge-stroke" />
    </svg>
  )
}

/** Renders a compact specimen in a fixed theme, so both can be compared at once. */
function ThemeSpecimen({ theme }: { theme: 'light' | 'dark' }) {
  return (
    <div data-theme={theme} className="overflow-hidden rounded-lg border border-border bg-bg text-text shadow-md">
      <div className="flex items-center justify-between gap-2 border-b border-border bg-surface px-4 py-2">
        <span className="text-sm font-semibold">{theme === 'light' ? 'Light: paper' : 'Dark: blackboard'}</span>
        <Button variant="primary">
          <Plus />
          Add
        </Button>
      </div>
      <div className="cl-canvas-grid flex flex-wrap items-center justify-center gap-2 px-4 py-8">
        <ShapeView type="rounded" size={{ width: 112, height: 56 }} label="Web app" />
        <EdgePreview width={36} />
        <ShapeView type="database" size={{ width: 80, height: 72 }} label="Data" selected />
      </div>
      <div className="flex flex-wrap gap-2 border-t border-border bg-surface px-4 py-3">
        <Button variant="secondary">Cancel</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="danger">Delete</Button>
      </div>
    </div>
  )
}

export function StyleSheetPage() {
  const [tool, setTool] = useState<Tool>('select')
  const [sheetOpen, setSheetOpen] = useState(true)

  return (
    <div className="min-h-dvh bg-bg text-text">
      <header className="cl-safe-top sticky top-0 z-10 border-b border-border bg-surface">
        <div className="cl-safe-x mx-auto flex h-header max-w-content items-center justify-between gap-2">
          <Logo />
          <div className="flex items-center gap-1">
            <span className="hidden text-sm text-text-muted sm:inline">Style sheet</span>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="cl-safe-x cl-safe-bottom mx-auto flex max-w-content flex-col gap-12 py-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Ideas to diagrams.</h1>
          <p className="max-w-prose text-base text-text-muted">
            The building blocks of Chalkline in one place. Every colour, radius and size here comes from the design tokens.
            Use the button in the top bar to switch between system, light and dark.
          </p>
        </div>

        <Section id="themes" title="Both themes" description="The same components rendered in each theme, side by side.">
          <div className="grid gap-4 md:grid-cols-2">
            <ThemeSpecimen theme="light" />
            <ThemeSpecimen theme="dark" />
          </div>
        </Section>

        <Section id="buttons" title="Buttons" description="Every button is at least 44px tall for touch.">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary">
              <Plus />
              Add shape
            </Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">
              <Trash2 />
              Delete
            </Button>
            <Button variant="primary" disabled>
              Disabled
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" size="icon" aria-label="Undo">
              <Undo2 />
            </Button>
            <Button variant="secondary" size="icon" aria-label="Redo">
              <Redo2 />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Duplicate">
              <Copy />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Layers" aria-pressed>
              <Layers />
            </Button>
            <Segmented label="Canvas tool" options={TOOL_OPTIONS} value={tool} onChange={setTool} />
            <span className="text-sm text-text-muted">Tool: {tool === 'select' ? 'select and move' : 'pan'}</span>
          </div>
        </Section>

        <Section id="inputs" title="Inputs">
          <div className="grid gap-4 sm:grid-cols-2">
            <Label>
              Label
              <Input defaultValue="API service" />
            </Label>
            <Label>
              Search
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-text-muted" aria-hidden="true" />
                <Input placeholder="Find a shape" className="pl-10" />
              </div>
            </Label>
          </div>
        </Section>

        <Section id="panels" title="Panels" description="Properties panel, floating toolbar and phone bottom sheet.">
          <div className="grid gap-4 lg:grid-cols-3">
            <Panel>
              <PanelHeader>
                <PanelTitle>Properties</PanelTitle>
                <Button variant="ghost" size="icon" aria-label="Close properties">
                  <X />
                </Button>
              </PanelHeader>
              <PanelBody>
                <Label>
                  Label
                  <Input defaultValue="Postgres" />
                </Label>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-text-muted">Type</span>
                  <span className="font-medium">Database</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-text-muted">Size</span>
                  <span className="font-medium tabular-nums">120 × 100</span>
                </div>
              </PanelBody>
            </Panel>

            <div className="cl-canvas-grid relative flex min-h-60 items-end justify-center overflow-hidden rounded-lg border border-border p-4">
              <Panel className="flex items-center gap-1 rounded-full p-1">
                <Segmented label="Canvas tool" options={TOOL_OPTIONS} value={tool} onChange={setTool} className="rounded-full" />
                <Button variant="ghost" size="icon" aria-label="Zoom out" className="rounded-full">
                  <ZoomOut />
                </Button>
                <Button variant="ghost" size="icon" aria-label="Zoom in" className="rounded-full">
                  <ZoomIn />
                </Button>
                <Button variant="primary" size="icon" aria-label="Add shape" className="rounded-full">
                  <Plus />
                </Button>
              </Panel>
            </div>

            <div className="cl-canvas-grid relative flex min-h-60 flex-col justify-end overflow-hidden rounded-lg border border-border">
              {sheetOpen ? (
                <Panel className="rounded-b-none border-x-0 border-b-0 shadow-lg">
                  <div className="flex justify-center pt-2" aria-hidden="true">
                    <div className="h-1 w-10 rounded-full bg-border-strong" />
                  </div>
                  <PanelHeader className="border-b-0">
                    <PanelTitle>Bottom sheet</PanelTitle>
                    <Button variant="ghost" size="icon" aria-label="Close sheet" onClick={() => setSheetOpen(false)}>
                      <X />
                    </Button>
                  </PanelHeader>
                  <div className="flex gap-2 overflow-x-auto px-4 pb-4">
                    {SHAPES.map(({ id: type }) => (
                      <Button key={type} variant="secondary" size="icon" aria-label={`Add ${type}`} title={type}>
                        <ShapeIcon type={type} />
                      </Button>
                    ))}
                  </div>
                </Panel>
              ) : (
                <div className="flex justify-center p-4">
                  <Button variant="secondary" onClick={() => setSheetOpen(true)}>
                    Open sheet
                  </Button>
                </div>
              )}
            </div>
          </div>
        </Section>

        <Section id="shapes" title="Node shapes" description="Each shape at its default size with no styling, then selected.">
          <div className="cl-canvas-grid flex flex-col gap-8 rounded-lg border border-border p-6">
            <div className="flex flex-wrap items-center justify-center gap-8">
              {SHAPES.map(({ id: type }) => (
                <ShapeView key={type} type={type as NodeType} size={getShape(type).defaultSize} label={getShape(type).defaultLabel} />
              ))}
            </div>
            <div className="flex flex-wrap items-center justify-center gap-8">
              {SHAPES.map(({ id: type }) => (
                <ShapeView key={type} type={type as NodeType} size={getShape(type).defaultSize} label={`${getShape(type).defaultLabel}`} selected />
              ))}
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <ShapeView type="actor" size={getShape('actor').defaultSize} label="Customer" />
              <EdgePreview />
              <ShapeView type="cloud" size={getShape('cloud').defaultSize} label="CDN" />
              <EdgePreview />
              <ShapeView type="rectangle" size={getShape('rectangle').defaultSize} label="A longer label that wraps onto more lines" />
            </div>
          </div>
        </Section>

        <Section id="presets" title="Colour presets" description="Soft fills with strong borders and text. Stored as theme tokens, so they adapt to light and dark.">
          <div className="cl-canvas-grid flex flex-wrap items-center justify-center gap-6 rounded-lg border border-border p-6">
            {COLOUR_PRESETS.map((preset) => (
              <ShapeView
                key={preset}
                type="rounded"
                size={{ width: 128, height: 64 }}
                label={PRESET_NAMES[preset]}
                appearance={nodeAppearance({ fill: presetToken(preset, 'soft'), stroke: presetToken(preset, 'strong') })}
              />
            ))}
            <ShapeView
              type="rectangle"
              size={{ width: 128, height: 64 }}
              label="Strong text"
              hasNotes
              appearance={nodeAppearance({ textColour: presetToken('red', 'strong'), strokeWidth: 3, fontSize: 18 })}
            />
          </div>
        </Section>

        <Section id="empty" title="Empty state">
          <Panel className="cl-canvas-grid">
            <EmptyState
              title="Start with a shape"
              action={
                <Button variant="primary">
                  <Plus />
                  Add shape
                </Button>
              }
            >
              Tap a shape in the palette to drop it on the canvas, then drag from its edge to connect.
            </EmptyState>
          </Panel>
        </Section>

        <Section id="colours" title="Colour tokens" description="Switch theme to see each token change.">
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {COLOUR_TOKENS.map((name) => (
              <li key={name} className="flex items-center gap-3 rounded-md border border-border bg-surface p-2">
                <span className="size-10 shrink-0 rounded-sm border border-border" style={{ background: `var(--cl-${name})` }} />
                <code className="min-w-0 truncate font-mono text-xs">{name}</code>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="type" title="Type" description="Inter, self-hosted.">
          <Panel>
            <ul className="divide-y divide-border">
              {TYPE_SCALE.map(([size, label]) => (
                <li key={size} className="flex items-baseline justify-between gap-4 px-4 py-3">
                  <span className={cn(size, 'min-w-0 truncate')}>{label}</span>
                  <code className="shrink-0 font-mono text-xs text-text-muted">{size}</code>
                </li>
              ))}
            </ul>
          </Panel>
        </Section>
      </main>
    </div>
  )
}
