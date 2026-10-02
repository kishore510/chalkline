import { useReactFlow, useStoreApi } from '@xyflow/react'
import { Blocks, Layers, Loader2, Pencil, Plus, RotateCcw, Settings as SettingsIcon, TriangleAlert, X } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { announce } from '@/a11y/announce'
import { Button } from '@/components/ui/button'
import { explainBlockedAdd, switchToUsableLayer } from '@/editor/layerNotices'
import { ToggleField } from '@/editor/fields'
import { spokenError, type FriendlyError } from '@/errors/friendly'
import { InlineProblem } from '@/errors/InlineProblem'
import { LearnMore } from '@/help/HelpEntry'
import { LEARN_MORE } from '@/help/links'
import { readToken } from '@/lib/cssVar'
import { motionMs } from '@/lib/motion'
import type { Diagram } from '@/schema/diagram'
import { openSettings } from '@/settings/SettingsEntry'
import { getSettings, updateSettings, useSettingsStore } from '@/settings/settingsStore'
import { useDiagramStore } from '@/store/diagramStore'
import { unionBox } from '@/store/groups'
import { useUiStore } from '@/store/uiStore'
import { AiSheetFrame, ModeSwitch, UsageLine, usePageFocus, WRAP } from './AiSheetFrame'
import { ConfirmSend } from './ConfirmSend'
import { useAiSheet } from './GenerateEntry'
import { Preview } from './GenerateSheet'
import { getApiKey, useKeyStatus } from './keyStore'
import { aiError } from './messages'
import type { Refinement } from './refine'
import { placeRefinement, previewDiagram, type RefinePlacement } from './refineLayout'
import { capMessage, REFINE_CAPS, refineHint, refineInput, refineModel, refinePlan, refineSelection, type RefineInput } from './refinePrompt'
import { useUsageStore } from './usage'

/*
 * Refine with AI: select shapes, say what to add around them, check what
 * will be sent, wait (or cancel), look at the preview, then Add to canvas.
 * ADD-ONLY: new shapes and connectors, some ending on existing shapes;
 * nothing already there is changed. Add is one undo step. Everything here is
 * view state: the instruction, the preview and its warnings are never saved,
 * undone or exported.
 */

type Page = 'compose' | 'confirm' | 'sending' | 'preview'

const TITLES: Record<Page, string> = {
  compose: 'Refine with AI',
  confirm: 'Check before sending',
  sending: 'Refining…',
  preview: 'Preview',
}

/** Generic starting points: they only fill in the instruction. */
export const REFINE_EXAMPLES = [
  { label: 'Cache', text: 'Add a cache between the selected shapes.' },
  { label: 'Monitoring', text: 'Add monitoring for the selected services.' },
  { label: 'Guardrail', text: 'Add a guardrail before the selected model.' },
] as const

export const UNCHANGED_NOTE = 'Existing connectors are not changed.'

const count = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`
const nameOf = (label: string) => (label.trim() ? `“${label.trim()}”` : 'Untitled shape')
const sameIds = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((id) => b.includes(id))

/** What a placement adds, in words: "2 new shapes, 3 new connectors (2 to existing shapes)". */
export function refineSummary(p: Pick<RefinePlacement, 'nodes' | 'edges'>): string {
  const fresh = new Set(p.nodes.map((n) => n.id))
  const toExisting = p.edges.filter((e) => !fresh.has(e.source) || !fresh.has(e.target)).length
  const connectors = p.edges.length ? `, ${count(p.edges.length, 'new connector')}${toExisting ? ` (${toExisting} to existing shapes)` : ''}` : ''
  return `${count(p.nodes.length, 'new shape')}${connectors}`
}

const gridNow = () => (useUiStore.getState().snapToGrid ? readToken('--cl-grid-gap', 20) : 0)

/** The new items in words, for screen readers and anyone who wants to read the labels. */
function ItemList({ placement, diagram }: { placement: RefinePlacement; diagram: Diagram }) {
  const label = new Map([...diagram.nodes, ...placement.nodes].map((n) => [n.id, n.label.trim() || 'Untitled']))
  const fresh = new Set(placement.nodes.map((n) => n.id))
  const end = (id: string) => (fresh.has(id) ? label.get(id) : `${label.get(id)} (existing)`)
  return (
    <details className="text-sm text-text">
      <summary className="flex min-h-touch cursor-pointer items-center font-medium">List the new shapes and connectors</summary>
      <ul className="flex list-disc flex-col gap-0.5 pl-5">
        {placement.nodes.map((n) => (
          <li key={n.id}>{n.label}</li>
        ))}
      </ul>
      {placement.edges.length > 0 && (
        <ul className="mt-2 flex list-disc flex-col gap-0.5 pl-5 text-text-muted">
          {placement.edges.map((e) => (
            <li key={e.id}>
              {end(e.source)} to {end(e.target)}
              {e.label ? `: ${e.label}` : ''}
            </li>
          ))}
        </ul>
      )}
    </details>
  )
}

function Warnings({ items }: { items: string[] }) {
  if (items.length === 0) return null
  return (
    <div role="group" aria-label="What was changed or left out" className="flex gap-2 rounded-md border border-border-strong p-3">
      <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-text-muted" />
      <div className="flex min-w-0 flex-col gap-1">
        <p className="font-semibold">What was changed or left out</p>
        <ul className="flex list-disc flex-col gap-0.5 pl-5">
          {items.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}

export function RefinePanel({ active }: { active: boolean }) {
  const close = useAiSheet((s) => s.closeGenerate)
  const hasKey = useKeyStatus((s) => s.place !== null)
  const needsNotice = useSettingsStore((s) => !s.settings.ai.noticeAcknowledged)
  const diagram = useDiagramStore((s) => s.diagram)
  const selectionIds = useDiagramStore((s) => s.selection)
  const flow = useReactFlow()
  const rfStore = useStoreApi()

  const [page, setPage] = useState<Page>('compose')
  const [instruction, setInstruction] = useState('')
  const [includeNotes, setIncludeNotes] = useState(false)
  const [captured, setCaptured] = useState<RefineInput | null>(null)
  /** The answer, with the input it was made for. */
  const [result, setResult] = useState<{ input: RefineInput; refinement: Refinement } | null>(null)
  const [problem, setProblem] = useState<FriendlyError | null>(null)
  const [blocked, setBlocked] = useState(false)
  const controller = useRef<AbortController | null>(null)
  /** The selection when this mode was first shown, to say when it changes. */
  const [openedWith] = useState(() => useDiagramStore.getState().selection)

  const bodyRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const countId = useId()
  const fieldId = useId()

  const selection = useMemo(() => refineSelection(diagram, selectionIds), [diagram, selectionIds])
  const hint = refineHint(selection)
  const trimmed = instruction.trim()
  const chars = [...instruction].length
  const selectionChanged = !sameIds(openedWith, selectionIds)

  // The preview, placed in the diagram as it is now (Add places it again, the same way).
  const placement = useMemo(
    () => (result?.refinement.kind === 'add' ? placeRefinement(diagram, result.refinement.laid, result.input.selectedIds, gridNow()) : null),
    [diagram, result],
  )
  const preview = useMemo(() => (placement ? previewDiagram(placement) : null), [placement])
  const dim = useMemo(() => new Set(placement?.anchors.map((n) => n.id) ?? []), [placement])

  const shut = () => {
    controller.current?.abort()
    close()
  }
  useEffect(() => () => controller.current?.abort(), [])

  const back = page === 'confirm' ? () => setPage(result ? 'preview' : 'compose') : page === 'preview' ? () => setPage('compose') : undefined
  usePageFocus(page, bodyRef, titleRef)

  /** Opens the check step with a snapshot: what is sent, whatever happens to the selection after. */
  function check(ids: readonly string[]) {
    const now = useDiagramStore.getState().diagram
    const chosen = refineSelection(now, ids)
    if (chosen.kind !== 'ok') {
      announce(refineHint(chosen))
      return
    }
    setCaptured(refineInput(now, chosen.shapes, instruction, includeNotes))
    setProblem(null)
    setPage('confirm')
  }

  async function send(input: RefineInput) {
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
    announce(`Refining with ${refineModel.name}…`)
    try {
      const [{ refineDiagram }, { getElk }] = await Promise.all([import('./refine'), import('@/layout/elkWorker')])
      const outcome = await refineDiagram(key, input, { signal: abort.signal, elk: await getElk(), grid: gridNow(), arrowhead: getSettings().canvas.arrowhead })
      useUsageStore.getState().record(refineModel, outcome.ok ? outcome.value.usage : outcome.usage)
      if (!useAiSheet.getState().open) return
      if (!outcome.ok && outcome.reason === 'cancelled') {
        setPage(result ? 'preview' : 'compose')
        announce('Refining cancelled. Nothing was changed.')
        return
      }
      if (!outcome.ok) {
        setProblem(outcome.error)
        setPage('compose')
        announce(spokenError(outcome.error))
        return
      }
      setResult({ input, refinement: outcome.value })
      setPage('preview')
      if (outcome.value.kind === 'nothing') {
        announce(`Nothing to add.${outcome.value.reason ? ` ${outcome.value.reason}` : ''}`)
      } else {
        const p = placeRefinement(useDiagramStore.getState().diagram, outcome.value.laid, input.selectedIds, gridNow())
        const warnings = outcome.value.warnings.length
        announce(`Ready: ${refineSummary(p)}${warnings ? `, with ${count(warnings, 'note')} on what was changed or left out` : ''}. Choose Add to canvas to add them.`)
      }
    } catch {
      const error = aiError('ai-unexpected', 'Refining failed before an answer could be read.')
      setProblem(error)
      setPage('compose')
      announce(spokenError(error))
    } finally {
      if (controller.current === abort) controller.current = null
    }
  }

  function add() {
    if (result?.refinement.kind !== 'add') return
    const store = useDiagramStore.getState()
    const placed = placeRefinement(store.diagram, result.refinement.laid, result.input.selectedIds, gridNow())
    const added = store.insertRefinement(placed.nodes, placed.edges)
    if (!added) {
      // The active layer is hidden or locked: say so here, keeping the preview (it cost a request).
      setBlocked(true)
      explainBlockedAdd()
      return
    }
    // Centre on the new items and the shapes they were made for.
    const { diagram: now, past } = useDiagramStore.getState()
    const historySize = past.length
    const show = new Set([...added.ids, ...result.input.selectedIds])
    const bounds = unionBox(now.nodes.filter((n) => show.has(n.id)).map((n) => ({ ...n.position, ...n.size })))
    const rect = rfStore.getState().domNode?.getBoundingClientRect()
    if (bounds && rect) {
      const zoom = flow.getZoom()
      const gutter = readToken('--cl-gutter', 16)
      const duration = motionMs('--cl-duration-base')
      if (bounds.width * zoom <= rect.width - 2 * gutter && bounds.height * zoom <= rect.height - 2 * gutter)
        void flow.setCenter(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, { zoom, duration })
      else void flow.fitBounds(bounds, { padding: 0.2, duration })
    }
    const dropped = placed.droppedLinks + added.dropped
    const what = refineSummary({ nodes: placed.nodes, edges: placed.edges.filter((e) => added.ids.includes(e.id)) })
    const extra = dropped ? ` ${count(dropped, 'connector')} to shapes that were deleted or hidden since ${dropped === 1 ? 'was' : 'were'} left out.` : ''
    useUiStore.getState().notify(`Added ${what}.${extra}`, {
      label: 'Undo',
      run: () => {
        const s = useDiagramStore.getState()
        if (s.past.length === historySize) s.undo()
        else useUiStore.getState().notify('Something else changed since; use the Undo button instead.')
      },
    })
    announce(`Added ${what}. They’re selected; Undo removes them.${extra}`)
    close()
  }

  const insertExample = (text: string) => {
    setInstruction((current) => (current.trim() ? `${current.trimEnd()} ${text}` : text).slice(0, REFINE_CAPS.instruction))
    document.getElementById(fieldId)?.focus()
  }

  let body: ReactNode
  if (!hasKey) {
    body = (
      <div className="flex flex-col gap-3 pt-4 text-sm text-text">
        <ModeSwitch />
        <p className="font-semibold">Add your API key first</p>
        <p>Refine uses your own Anthropic API key, and you pay Anthropic for what it uses. Nothing is sent until you check and press Send.</p>
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
        <LearnMore topic={LEARN_MORE.refine} className="self-start px-0" />
      </div>
    )
  } else if (page === 'compose') {
    body = (
      <div className="flex flex-col gap-4 pt-4 text-sm text-text">
        <ModeSwitch />
        <p>Adds new shapes and connectors around the selected shapes. Nothing already on your canvas is changed, moved or removed.</p>
        {selection.kind === 'ok' ? (
          <div className="flex flex-col gap-1">
            <p className="font-medium">{count(selection.shapes.length, 'selected shape')}</p>
            <p className="text-xs break-words text-text-muted">{selection.shapes.map((n) => nameOf(n.label)).join(', ')}</p>
          </div>
        ) : (
          <p role="note" className="rounded-md border border-border-strong p-3">
            {hint}
          </p>
        )}
        <p role="status" className="text-xs text-text-muted">
          {selectionChanged ? 'The selection changed: what’s sent will use the shapes selected now.' : 'What’s sent follows the selection until you choose Generate.'}
        </p>
        <div className="flex flex-col gap-1">
          <label htmlFor={fieldId} className="font-medium">
            What should be added?
          </label>
          <textarea
            id={fieldId}
            data-autofocus=""
            value={instruction}
            maxLength={REFINE_CAPS.instruction}
            onChange={(e) => setInstruction(e.target.value)}
            aria-describedby={countId}
            placeholder="For example: add a cache between these two."
            className="min-h-(--cl-ai-description-height) w-full resize-y rounded-md border border-border bg-surface p-3 text-sm text-text placeholder:text-text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          />
          <p id={countId} className="text-xs text-text-muted tabular-nums">
            {chars.toLocaleString('en-GB')} of {REFINE_CAPS.instruction.toLocaleString('en-GB')} characters.
          </p>
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium text-text-muted">Start from an example</p>
          <div className="flex flex-wrap gap-2">
            {REFINE_EXAMPLES.map((example) => (
              <Button key={example.label} variant="secondary" className={WRAP} onClick={() => insertExample(example.text)}>
                {example.label}
              </Button>
            ))}
          </div>
        </div>
        <ToggleField label="Include notes" pressed={includeNotes} onChange={setIncludeNotes} />
        <p className="text-xs text-text-muted">
          Model: <span className="font-medium text-text">{refineModel.name}</span>. The selected shapes and the shapes they connect to (labels and shape types) are sent to Anthropic’s API when you press Send. Ids and positions are never sent.
        </p>
        {problem && (
          <InlineProblem error={problem}>
            {problem.kind !== 'ai-no-key' && (
              <Button variant="secondary" onClick={() => check(selectionIds)} disabled={!trimmed || selection.kind !== 'ok'}>
                <RotateCcw />
                Retry
              </Button>
            )}
          </InlineProblem>
        )}
        <Button variant="primary" className={WRAP} disabled={!trimmed || selection.kind !== 'ok'} onClick={() => check(selectionIds)}>
          <Blocks />
          Generate
        </Button>
        {result && (
          <Button variant="ghost" className={WRAP} onClick={() => setPage('preview')}>
            Back to the last preview
          </Button>
        )}
        <UsageLine />
        <LearnMore topic={LEARN_MORE.refine} className="self-start px-0" />
      </div>
    )
  } else if (page === 'confirm' && captured) {
    const limit = capMessage(captured)
    body = (
      <div className="pt-4">
        <ConfirmSend
          plan={refinePlan(captured)}
          needsNotice={needsNotice}
          details={[
            { term: 'Scope', value: `${count(captured.counts.shapes, 'selected shape')} and ${count(captured.counts.neighbours, 'connected shape')} (${captured.contextShapes} of at most ${REFINE_CAPS.context}).` },
            { term: 'Result', value: `A preview of at most ${REFINE_CAPS.nodes} new shapes and ${REFINE_CAPS.edges} new connectors. Nothing is added until you choose Add to canvas, and nothing already there is changed.` },
          ]}
          limit={limit ? { message: limit } : undefined}
          onCancel={() => setPage(result ? 'preview' : 'compose')}
          onSend={() => {
            if (needsNotice) updateSettings({ ai: { noticeAcknowledged: true } })
            void send(captured)
          }}
        />
      </div>
    )
  } else if (page === 'sending') {
    body = (
      <div className="flex flex-col gap-4 pt-4 text-sm text-text">
        <p className="flex min-h-touch items-center gap-2" role="status">
          <Loader2 aria-hidden="true" className="size-5 shrink-0 motion-safe:animate-spin" />
          Asking {refineModel.name} what to add. This can take up to a minute.
        </p>
        <p className="text-xs text-text-muted">It uses the {captured ? count(captured.counts.shapes, 'shape') : 'shapes'} selected when you pressed Send; changing the selection now doesn’t change this request.</p>
        <Button variant="secondary" className={WRAP} onClick={() => controller.current?.abort()} data-autofocus="">
          <X />
          Cancel
        </Button>
      </div>
    )
  } else if (result) {
    const r = result.refinement
    const moved = !sameIds(result.input.selectedIds, selectionIds)
    body = (
      <div className="flex flex-col gap-4 pt-4 text-sm text-text">
        {r.kind === 'nothing' || !placement || !preview ? (
          <>
            <h3 tabIndex={-1} data-autofocus="" className="font-semibold outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
              Nothing to add
            </h3>
            <p>{r.reason ? `The AI said: ${r.reason}` : 'The AI didn’t suggest anything that could be added. Try rewording the instruction.'}</p>
            <p className="text-xs text-text-muted">Refine can only add shapes and connectors; it can’t rename, move, restyle or delete anything.</p>
            <Warnings items={r.warnings} />
          </>
        ) : (
          <>
            <p>
              <span className="font-medium">{refineSummary(placement)}</span>, placed beside the selection. Nothing is on your canvas until you choose Add to canvas.
            </p>
            <Preview diagram={preview} dim={dim} />
            <p className="text-xs text-text-muted">
              {placement.anchors.length ? `Faded: ${count(placement.anchors.length, 'existing shape')} the new connectors attach to. ` : ''}
              {UNCHANGED_NOTE}
            </p>
            <ItemList placement={placement} diagram={diagram} />
            <Warnings items={[...r.warnings, ...(placement.droppedLinks ? [`${count(placement.droppedLinks, 'connector')} to shapes deleted or hidden since will be left out.`] : [])]} />
            {moved && <p className="text-xs text-text-muted">The selection has changed since you sent this. Add to canvas still places it beside the shapes it was made for.</p>}
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
          </>
        )}
        <div className="flex flex-col gap-2">
          {r.kind === 'add' && placement && (
            <Button variant="primary" className={WRAP} onClick={add} data-autofocus="">
              <Plus />
              Add to canvas
            </Button>
          )}
          <Button variant="secondary" className={WRAP} onClick={() => check(result.input.selectedIds)}>
            <RotateCcw />
            Regenerate
          </Button>
          <Button variant="secondary" className={WRAP} onClick={() => setPage('compose')}>
            <Pencil />
            Edit instruction
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
      icon={<Blocks />}
      back={hasKey ? back : undefined}
      busy={page === 'sending'}
      onEscape={() => (page === 'sending' ? controller.current?.abort() : back ? back() : shut())}
      onClose={shut}
      bodyRef={bodyRef}
      titleRef={titleRef}
    >
      {body}
    </AiSheetFrame>
  )
}
