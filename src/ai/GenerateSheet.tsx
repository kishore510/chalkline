import { useReactFlow, useStoreApi } from '@xyflow/react'
import { Layers, Loader2, Pencil, Plus, RotateCcw, Settings as SettingsIcon, TriangleAlert, WandSparkles, X } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { announce } from '@/a11y/announce'
import { revealViewport } from '@/canvas/floating'
import { Button } from '@/components/ui/button'
import { explainBlockedAdd, switchToUsableLayer } from '@/editor/layerNotices'
import { ToggleField } from '@/editor/fields'
import { useThemeName } from '@/editor/stencils/Thumbnail'
import { spokenError, type FriendlyError } from '@/errors/friendly'
import { InlineProblem } from '@/errors/InlineProblem'
import { buildSvg } from '@/export/svg'
import { screenEnv } from '@/export/browser'
import { LearnMore } from '@/help/HelpEntry'
import { LEARN_MORE } from '@/help/links'
import { readToken } from '@/lib/cssVar'
import { motionMs } from '@/lib/motion'
import type { Diagram } from '@/schema/diagram'
import { openSettings } from '@/settings/SettingsEntry'
import { getSettings, updateSettings, useSettingsStore } from '@/settings/settingsStore'
import { resolveTokenColours } from '@/stencils/thumbnail'
import { useDiagramStore } from '@/store/diagramStore'
import { unionBox } from '@/store/groups'
import { useUiStore } from '@/store/uiStore'
import { AiSheetFrame, ModeSwitch, UsageLine, usePageFocus, WRAP } from './AiSheetFrame'
import { ConfirmSend } from './ConfirmSend'
import type { Generation } from './generate'
import { CAPS } from './generated'
import { generatePlan } from './generatePrompt'
import { useGenerateSheet } from './GenerateEntry'
import { getApiKey, useKeyStatus } from './keyStore'
import { aiError } from './messages'
import { AI_MODELS } from './models'
import { describeAdditions, useRefineLog } from './refineNarrative'
import { useUsageStore } from './usage'

/*
 * Generate diagram: describe it, check what will be sent, wait (or cancel),
 * look at the preview, then Add to canvas. Nothing touches the diagram until
 * Add, which is one undo step. Everything here is view state: the
 * description, the preview and its warnings are never saved or exported.
 * One of the AI sheet's two modes (see AiSheet).
 */

type Page = 'compose' | 'confirm' | 'sending' | 'preview'

const TITLES: Record<Page, string> = {
  compose: 'Generate a diagram',
  confirm: 'Check before sending',
  sending: 'Generating…',
  preview: 'Preview',
}

/** The longest description quoted in the AI change log. */
const LOG_DESCRIPTION = 200

/** Generic starting points: they only fill in the description. */
export const EXAMPLES = [
  { label: 'Web app', text: 'A web app: users reach a load balancer in front of two app servers, which use a PostgreSQL database and a Redis cache.' },
  { label: 'Event pipeline', text: 'An event-driven order pipeline: the orders service publishes events to a message bus; billing and email workers subscribe, and all events land in a data lake.' },
  { label: 'AI agent with MCP', text: 'An AI support agent sends requests through an AI gateway to an MCP client, which calls a tickets MCP server exposing a search-tickets tool.' },
] as const

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** What the generated diagram holds, in words. */
export function summary(g: Pick<Generation, 'content'>): string {
  const { nodes, edges, groups } = g.content
  return [count(nodes.length, 'shape'), count(edges.length, 'connector'), ...(groups.length ? [count(groups.length, 'group')] : [])].join(', ')
}

/** The preview as standalone SVG that fits its box. Labels are escaped by buildSvg; colours stay var(--cl-…) until shown. */
function previewSvg(diagram: Diagram, dim?: ReadonlySet<string>): string {
  const faded = dim && dim.size > 0 ? { ids: dim, opacity: readToken('--cl-ai-anchor-opacity', 0.4) } : undefined
  const { svg, width, height } = buildSvg(diagram, screenEnv(), { padding: 16, background: false, dim: faded })
  return svg
    .replace(`width="${width}" height="${height}"`, 'width="100%" height="100%" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false"')
    .replace(/<title>[^<]*<\/title>/, '')
}

/** A diagram drawn as the canvas draws it (`dim`: shapes to fade, as read-only context). Also used by Refine. */
export function Preview({ diagram, dim }: { diagram: Diagram; dim?: ReadonlySet<string> }) {
  const theme = useThemeName()
  const svg = useMemo(() => previewSvg(diagram, dim), [diagram, dim])
  const html = useMemo(() => {
    const style = getComputedStyle(document.documentElement)
    return resolveTokenColours(svg, (token) => style.getPropertyValue(`--cl-${token}`).trim())
    // `theme` matters: new colours when it changes.
  }, [svg, theme])
  return (
    <div
      aria-hidden="true"
      className="h-(--cl-ai-preview-max-height) min-h-(--cl-ai-preview-min-height) w-full overflow-hidden rounded-md border border-border bg-canvas p-2 [&>svg]:block [&>svg]:size-full"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

/** The generated items in words, for screen readers and anyone who wants to read the labels. */
function ItemList({ g }: { g: Generation }) {
  const label = new Map(g.content.nodes.map((n) => [n.id, n.label]))
  return (
    <details className="text-sm text-text">
      <summary className="flex min-h-touch cursor-pointer items-center font-medium">List the shapes and connectors</summary>
      <ul className="flex list-disc flex-col gap-0.5 pl-5">
        {g.content.nodes.map((n) => (
          <li key={n.id}>{n.label}</li>
        ))}
      </ul>
      {g.content.edges.length > 0 && (
        <ul className="mt-2 flex list-disc flex-col gap-0.5 pl-5 text-text-muted">
          {g.content.edges.map((e) => (
            <li key={e.id}>
              {label.get(e.source)} to {label.get(e.target)}
              {e.label ? `: ${e.label}` : ''}
            </li>
          ))}
        </ul>
      )}
    </details>
  )
}

export function GeneratePanel({ active }: { active: boolean }) {
  const close = useGenerateSheet((s) => s.closeGenerate)
  const hasKey = useKeyStatus((s) => s.place !== null)
  const needsNotice = useSettingsStore((s) => !s.settings.ai.noticeAcknowledged)
  const flow = useReactFlow()
  const rfStore = useStoreApi()

  const [page, setPage] = useState<Page>('compose')
  const [description, setDescription] = useState('')
  const [includeNotes, setIncludeNotes] = useState(false)
  const [problem, setProblem] = useState<FriendlyError | null>(null)
  const [blocked, setBlocked] = useState(false)
  const [generation, setGeneration] = useState<Generation | null>(null)
  const controller = useRef<AbortController | null>(null)

  const bodyRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const countId = useId()
  const fieldId = useId()

  const trimmed = description.trim()
  const chars = [...description].length
  const plan = useMemo(() => generatePlan(description, includeNotes), [description, includeNotes])

  // Closing stops a request in flight; nothing is applied.
  const shut = () => {
    controller.current?.abort()
    close()
  }
  useEffect(() => () => controller.current?.abort(), [])

  const back = page === 'confirm' ? () => setPage(generation ? 'preview' : 'compose') : page === 'preview' ? () => setPage('compose') : undefined
  usePageFocus(page, bodyRef, titleRef)

  async function run() {
    const key = getApiKey()
    if (!key) {
      setProblem(aiError('ai-no-key'))
      setPage('compose')
      return
    }
    const abort = new AbortController()
    controller.current = abort
    setProblem(null)
    setBlocked(false)
    setPage('sending')
    announce(`Generating a diagram with ${AI_MODELS.large.name}…`)
    try {
      const [{ generateDiagram }, { getElk }] = await Promise.all([import('./generate'), import('@/layout/elkWorker')])
      const ui = useUiStore.getState()
      const outcome = await generateDiagram(key, description, includeNotes, {
        signal: abort.signal,
        elk: await getElk(),
        grid: ui.snapToGrid ? readToken('--cl-grid-gap', 20) : 0,
        arrowhead: getSettings().canvas.arrowhead,
      })
      useUsageStore.getState().record(AI_MODELS.large, outcome.ok ? outcome.value.usage : outcome.usage)
      // Closed meanwhile: the request was stopped and there's nothing to show.
      if (!useGenerateSheet.getState().open) return
      if (!outcome.ok && outcome.reason === 'cancelled') {
        // Cancelled: back to the description, quietly.
        setPage(generation ? 'preview' : 'compose')
        announce('Generating cancelled. Nothing was sent back or changed.')
        return
      }
      if (!outcome.ok) {
        setProblem(outcome.error)
        setPage('compose')
        announce(spokenError(outcome.error))
        return
      }
      setGeneration(outcome.value)
      setPage('preview')
      const warnings = outcome.value.warnings.length
      announce(`Diagram ready: ${summary(outcome.value)}${warnings ? `, with ${count(warnings, 'note')} on what was changed` : ''}. Choose Add to canvas to add it.`)
    } catch {
      const error = aiError('ai-unexpected', 'Generating failed before an answer could be read.')
      setProblem(error)
      setPage('compose')
      announce(spokenError(error))
    } finally {
      if (controller.current === abort) controller.current = null
    }
  }

  function cancel() {
    controller.current?.abort()
  }

  function add() {
    if (!generation) return
    const rect = rfStore.getState().domNode?.getBoundingClientRect()
    const centre = rect ? flow.screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }) : { x: 0, y: 0 }
    const store = useDiagramStore.getState()
    // Already on the grid from layout; placing keeps it there.
    const ids = store.insertGenerated(generation.content, centre, useUiStore.getState().snapToGrid ? readToken('--cl-grid-gap', 20) : 0)
    if (!ids) {
      // The active layer is hidden or locked: say so here, keeping the preview (it cost a request).
      setBlocked(true)
      explainBlockedAdd()
      return
    }
    const added = new Set(ids)
    const { diagram, past } = useDiagramStore.getState()
    const bounds = unionBox([...diagram.nodes, ...diagram.groups].filter((i) => added.has(i.id)).map((i) => ({ ...i.position, ...i.size })))
    if (bounds && rect && revealViewport(bounds, flow.getViewport(), rect, readToken('--cl-gutter', 16))) {
      void flow.fitBounds(bounds, { padding: 0.2, duration: motionMs('--cl-duration-base') })
    }
    const what = summary(generation)
    const historySize = past.length
    // The log: what was added, as one line that selects it all, then each shape.
    const shapes = diagram.nodes.filter((n) => added.has(n.id))
    useRefineLog.getState().add(
      {
        feature: 'generate',
        at: Date.now(),
        instruction: [...description.trim()].length > LOG_DESCRIPTION ? `${[...description.trim()].slice(0, LOG_DESCRIPTION - 1).join('')}…` : description.trim(),
        summary: `Generated a new diagram: ${what}.`,
        items: [
          { key: 'all', kind: 'added', text: `Added ${what}`, why: '', ids },
          ...describeAdditions(diagram, shapes, [], new Map()).map((item) => ({ ...item, key: `n:${item.key}` })),
        ],
        historySize,
      },
      { open: false },
    )
    useUiStore.getState().notify(`Added ${what}.`, {
      label: 'Undo',
      run: () => {
        const s = useDiagramStore.getState()
        if (s.past.length === historySize) s.undo()
        else useUiStore.getState().notify('Something else changed since; use the Undo button instead.')
      },
    })
    announce(`Added ${what}. They’re selected; Undo removes them.`)
    close()
  }

  const insertExample = (text: string) => {
    setDescription((current) => (current.trim() ? `${current.trimEnd()}\n${text}` : text).slice(0, CAPS.description))
    document.getElementById(fieldId)?.focus()
  }

  let body: ReactNode
  if (!hasKey) {
    body = (
      <div className="flex flex-col gap-3 pt-4 text-sm text-text">
        <ModeSwitch />
        <p className="font-semibold">Add your API key first</p>
        <p>Generate diagram uses your own Anthropic API key, and you pay Anthropic for what it uses. Nothing is sent until you check and press Send.</p>
        <Button
          variant="primary"
          className={WRAP}
          data-autofocus=""
          onClick={() => {
            close()
            openSettings('ai')
          }}
        >
          <SettingsIcon />
          Open Settings, AI
        </Button>
        <LearnMore topic={LEARN_MORE.generate} className="self-start px-0" />
      </div>
    )
  } else if (page === 'compose') {
    body = (
      <div className="flex flex-col gap-4 pt-4">
        <ModeSwitch />
        <div className="flex flex-col gap-1">
          <label htmlFor={fieldId} className="text-sm font-medium text-text">
            Describe the diagram
          </label>
          <textarea
            id={fieldId}
            data-autofocus=""
            value={description}
            maxLength={CAPS.description}
            onChange={(e) => setDescription(e.target.value)}
            aria-describedby={countId}
            placeholder="For example: a mobile app calls an API gateway, which routes to an orders service and a payments service, each with its own database."
            className="min-h-(--cl-ai-description-height) w-full resize-y rounded-md border border-border bg-surface p-3 text-sm text-text placeholder:text-text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          />
          <p id={countId} className="text-xs text-text-muted tabular-nums">
            {chars.toLocaleString('en-GB')} of {CAPS.description.toLocaleString('en-GB')} characters. Only this text is sent, not your diagram.
          </p>
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium text-text-muted">Start from an example</p>
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((example) => (
              <Button key={example.label} variant="secondary" className={WRAP} onClick={() => insertExample(example.text)}>
                {example.label}
              </Button>
            ))}
          </div>
        </div>
        <ToggleField label="Include short notes" pressed={includeNotes} onChange={setIncludeNotes} />
        <p className="text-xs text-text-muted">
          Model: <span className="font-medium text-text">{AI_MODELS.large.name}</span>. Shapes are only ever added, in empty space; nothing on your canvas is changed.
        </p>
        {problem && (
          <InlineProblem error={problem}>
            {problem.kind !== 'ai-no-key' && (
              <Button variant="secondary" onClick={() => setPage('confirm')} disabled={!trimmed}>
                <RotateCcw />
                Retry
              </Button>
            )}
          </InlineProblem>
        )}
        <Button
          variant="primary"
          className={WRAP}
          disabled={!trimmed}
          onClick={() => {
            setProblem(null)
            setPage('confirm')
          }}
        >
          <WandSparkles />
          Generate
        </Button>
        <UsageLine />
        <LearnMore topic={LEARN_MORE.generate} className="self-start px-0" />
      </div>
    )
  } else if (page === 'confirm') {
    body = (
      <div className="pt-4">
        <ConfirmSend
          plan={plan}
          needsNotice={needsNotice}
          onCancel={() => setPage(generation ? 'preview' : 'compose')}
          onSend={() => {
            if (needsNotice) updateSettings({ ai: { noticeAcknowledged: true } })
            void run()
          }}
        />
      </div>
    )
  } else if (page === 'sending') {
    body = (
      <div className="flex flex-col gap-4 pt-4 text-sm text-text">
        <p className="flex min-h-touch items-center gap-2" role="status">
          <Loader2 aria-hidden="true" className="size-5 shrink-0 motion-safe:animate-spin" />
          Asking {AI_MODELS.large.name} for a diagram. This can take up to a minute.
        </p>
        <Button variant="secondary" className={WRAP} onClick={cancel} data-autofocus="">
          <X />
          Cancel
        </Button>
      </div>
    )
  } else if (generation) {
    body = (
      <div className="flex flex-col gap-4 pt-4 text-sm text-text">
        <p>
          <span className="font-medium">{summary(generation)}</span>, laid out left to right. Nothing is on your canvas until you choose Add to canvas.
        </p>
        <Preview diagram={generation.preview} />
        <ItemList g={generation} />
        {generation.warnings.length > 0 && (
          <div role="group" aria-label="What was changed" className="flex gap-2 rounded-md border border-border-strong p-3">
            <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-text-muted" />
            <div className="flex min-w-0 flex-col gap-1">
              <p className="font-semibold">What was changed</p>
              <ul className="flex list-disc flex-col gap-0.5 pl-5">
                {generation.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
        {blocked && (
          <div className="flex flex-col gap-2 rounded-md border border-danger p-3">
            <p>The layer you’re adding to is hidden or locked. Switch to another layer, then choose Add to canvas again.</p>
            <Button
              variant="secondary"
              className={WRAP}
              onClick={() => {
                switchToUsableLayer()
                setBlocked(false)
              }}
            >
              <Layers />
              Switch layer
            </Button>
          </div>
        )}
        <div className="flex flex-col gap-2">
          <Button variant="primary" className={WRAP} onClick={add} data-autofocus="">
            <Plus />
            Add to canvas
          </Button>
          <Button variant="secondary" className={WRAP} onClick={() => setPage('confirm')}>
            <RotateCcw />
            Regenerate
          </Button>
          <Button variant="secondary" className={WRAP} onClick={() => setPage('compose')}>
            <Pencil />
            Edit description
          </Button>
          <Button variant="ghost" className={WRAP} onClick={shut}>
            Cancel
          </Button>
        </div>
        <UsageLine />
      </div>
    )
  }

  if (!active) return null
  return (
    <AiSheetFrame
      title={hasKey ? TITLES[page] : TITLES.compose}
      icon={<WandSparkles />}
      back={hasKey ? back : undefined}
      busy={page === 'sending'}
      onEscape={() => (page === 'sending' ? cancel() : back ? back() : shut())}
      onClose={shut}
      bodyRef={bodyRef}
      titleRef={titleRef}
    >
      {body}
    </AiSheetFrame>
  )
}
