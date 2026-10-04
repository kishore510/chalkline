import { useReactFlow, useStoreApi } from '@xyflow/react'
import { Blocks, Check, Layers, Loader2, Pencil, RotateCcw, Settings as SettingsIcon, TriangleAlert, X } from 'lucide-react'
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
import type { RefineFix } from './refineFixes'
import { placeRefinement, previewDiagram, type RefinePlacement } from './refineLayout'
import { ShowLogButton, StoryLine } from './RefineLog'
import { describeAdditions, describeFixes, useRefineLog, type StoryItem } from './refineNarrative'
import { capMessage, REFINE_CAPS, refineHint, refineInput, refineModel, refinePlan, refineSelection, type RefineInput } from './refinePrompt'
import { useUsageStore } from './usage'

/*
 * Refine with AI: select shapes, say what to add or fix, check what will be
 * sent, wait (or cancel), read the preview and the AI's reasons, untick any
 * fix you don't want, then Apply. Refine adds shapes and connectors and FIXES
 * the selected part: relabel, reshape or remove selected shapes; relabel,
 * redirect or remove their connectors. Apply is one undo step, and its story
 * goes to the AI change log. Everything here is view state: the instruction,
 * the preview and its warnings are never saved, undone or exported.
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

export const NOTHING_SILENT = 'Nothing changes until you choose Apply, and Undo puts everything back in one step.'

const count = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`
const nameOf = (label: string) => (label.trim() ? `“${label.trim()}”` : 'Untitled shape')
const sameIds = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((id) => b.includes(id))

/** What a refinement does, in words: "2 new shapes, 3 new connectors (2 to existing shapes), 1 fix". */
export function refineSummary(p: Pick<RefinePlacement, 'nodes' | 'edges'>, fixes = 0): string {
  const fresh = new Set(p.nodes.map((n) => n.id))
  const toExisting = p.edges.filter((e) => !fresh.has(e.source) || !fresh.has(e.target)).length
  const parts = [
    ...(p.nodes.length ? [count(p.nodes.length, 'new shape')] : []),
    ...(p.edges.length ? [`${count(p.edges.length, 'new connector')}${toExisting ? ` (${toExisting} to existing shapes)` : ''}`] : []),
    ...(fixes ? [count(fixes, 'fix', 'fixes')] : []),
  ]
  return parts.length ? parts.join(', ') : 'No changes'
}

const gridNow = () => (useUiStore.getState().snapToGrid ? readToken('--cl-grid-gap', 20) : 0)

/** The fixes, each with a tick box (on by default), then the additions; each with the AI's reason. */
function Story({ fixes, additions, off, toggle }: { fixes: StoryItem[]; additions: StoryItem[]; off: ReadonlySet<string>; toggle: (key: string) => void }) {
  return (
    <div className="flex flex-col gap-3">
      {fixes.length > 0 && (
        <div role="group" aria-label="Fixes to what’s there" className="flex flex-col gap-2">
          <p className="font-semibold">Fixes to what’s there</p>
          <p className="text-xs text-text-muted">Untick any fix you don’t want.</p>
          <ul className="flex flex-col gap-2">
            {fixes.map((item) => (
              <StoryLine key={item.key} item={item}>
                <input
                  type="checkbox"
                  aria-label={`Apply: ${item.text}`}
                  checked={!off.has(item.key)}
                  onChange={() => toggle(item.key)}
                  className="mt-0.5 size-4 shrink-0 accent-accent"
                />
              </StoryLine>
            ))}
          </ul>
        </div>
      )}
      {additions.length > 0 && (
        <div role="group" aria-label="Additions" className="flex flex-col gap-2">
          <p className="font-semibold">Additions</p>
          <ul className="flex flex-col gap-2">
            {additions.map((item) => (
              <StoryLine key={item.key} item={item} />
            ))}
          </ul>
        </div>
      )}
    </div>
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
  /** Fixes the person unticked, by key. */
  const [off, setOff] = useState<ReadonlySet<string>>(new Set())
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

  // The preview, placed in the diagram as it is now (Apply places it again, the same way).
  const placement = useMemo(
    () => (result?.refinement.kind === 'refine' ? placeRefinement(diagram, result.refinement.laid, result.input.selectedIds, gridNow()) : null),
    [diagram, result],
  )
  const fixes: RefineFix[] = useMemo(() => (result?.refinement.kind === 'refine' ? result.refinement.fixes : []), [result])
  const chosen = useMemo(() => fixes.filter((f) => !off.has(f.key)), [fixes, off])
  const preview = useMemo(() => (placement ? previewDiagram(diagram, placement, chosen) : null), [diagram, placement, chosen])
  const story = useMemo(
    () =>
      result?.refinement.kind === 'refine' && placement
        ? { fixes: describeFixes(diagram, fixes), additions: describeAdditions(diagram, placement.nodes, placement.edges, result.refinement.laid.why) }
        : null,
    [diagram, fixes, placement, result],
  )
  const toggle = (key: string) =>
    setOff((current) => {
      const next = new Set(current)
      if (!next.delete(key)) next.add(key)
      return next
    })

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
      setOff(new Set())
      setPage('preview')
      if (outcome.value.kind === 'nothing') {
        announce(`Nothing to change.${outcome.value.summary ? ` ${outcome.value.summary}` : ''}`)
      } else {
        const p = placeRefinement(useDiagramStore.getState().diagram, outcome.value.laid, input.selectedIds, gridNow())
        const warnings = outcome.value.warnings.length
        announce(
          `Ready: ${refineSummary(p, outcome.value.fixes.length)}${warnings ? `, with ${count(warnings, 'note')} on what was left out` : ''}. ${outcome.value.summary} Choose Apply to make these changes.`,
        )
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

  function apply() {
    if (result?.refinement.kind !== 'refine') return
    const r = result.refinement
    const store = useDiagramStore.getState()
    const before = store.diagram
    const placed = placeRefinement(before, r.laid, result.input.selectedIds, gridNow())
    const applied = store.applyRefinement({ nodes: placed.nodes, edges: placed.edges, fixes: chosen })
    if (!applied) {
      // The active layer is hidden or locked: say so here, keeping the preview (it cost a request).
      setBlocked(true)
      explainBlockedAdd()
      return
    }
    // Centre on what changed and the shapes it was made for.
    const { diagram: now, past } = useDiagramStore.getState()
    const historySize = past.length
    const changedIds = applied.results.filter((x) => x.status === 'applied' && x.fix.action !== 'remove').map((x) => x.fix.id)
    const show = new Set([...applied.ids, ...result.input.selectedIds, ...changedIds])
    const boxes = now.nodes.filter((n) => show.has(n.id) || now.edges.some((e) => show.has(e.id) && (e.source === n.id || e.target === n.id)))
    const bounds = unionBox(boxes.map((n) => ({ ...n.position, ...n.size })))
    const rect = rfStore.getState().domNode?.getBoundingClientRect()
    if (bounds && rect) {
      const zoom = flow.getZoom()
      const gutter = readToken('--cl-gutter', 16)
      const duration = motionMs('--cl-duration-base')
      if (bounds.width * zoom <= rect.width - 2 * gutter && bounds.height * zoom <= rect.height - 2 * gutter)
        void flow.setCenter(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, { zoom, duration })
      else void flow.fitBounds(bounds, { padding: 0.2, duration })
    }
    const added = new Set(applied.ids)
    const fixed = applied.results.filter((x) => x.status === 'applied').length
    const what = refineSummary({ nodes: placed.nodes.filter((n) => added.has(n.id)), edges: placed.edges.filter((e) => added.has(e.id)) }, fixed)
    const skipped = applied.results.length - fixed
    const dropped = placed.droppedLinks + applied.dropped
    const extra = [
      ...(skipped ? [`${count(skipped, 'fix', 'fixes')} skipped.`] : []),
      ...(dropped ? [`${count(dropped, 'connector')} left out (an end is gone, hidden, or already connected).`] : []),
    ].join(' ')
    // The story, against the diagram as it was, so names read as they were.
    useRefineLog.getState().add({
      at: Date.now(),
      instruction: result.input.instruction,
      summary: r.summary,
      items: [
        ...describeFixes(before, chosen, applied.results),
        ...describeAdditions(
          before,
          placed.nodes.filter((n) => added.has(n.id)),
          placed.edges.filter((e) => added.has(e.id)),
          r.laid.why,
        ),
      ],
      historySize,
    })
    useUiStore.getState().notify(`Applied ${what}.${extra ? ` ${extra}` : ''}`, {
      label: 'Undo',
      run: () => {
        const s = useDiagramStore.getState()
        if (s.past.length === historySize) s.undo()
        else useUiStore.getState().notify('Something else changed since; use the Undo button instead.')
      },
    })
    announce(`Applied ${what}. The AI change log explains each change; Undo puts it all back.${extra ? ` ${extra}` : ''}`)
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
        <p>Adds shapes and connectors around the selected shapes, and fixes what needs fixing there: names, shape types, arrow directions, missing or redundant connectors. Every change comes with the AI’s reason, and you choose what to apply.</p>
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
            What should be added or improved?
          </label>
          <textarea
            id={fieldId}
            data-autofocus=""
            value={instruction}
            maxLength={REFINE_CAPS.instruction}
            onChange={(e) => setInstruction(e.target.value)}
            aria-describedby={countId}
            placeholder="For example: add a cache between these two and fix anything that looks wrong."
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
        <ShowLogButton className={WRAP} onOpen={close} />
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
            {
              term: 'Result',
              value: `A preview of at most ${REFINE_CAPS.nodes} new shapes, ${REFINE_CAPS.edges} new connectors and ${REFINE_CAPS.changes} fixes to the selected shapes and their connectors, each with a reason. Nothing changes until you choose Apply.`,
            },
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
          Asking {refineModel.name} what to add or fix. This can take up to a minute.
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
        {r.kind === 'nothing' || !placement || !preview || !story ? (
          <>
            <h3 tabIndex={-1} data-autofocus="" className="font-semibold outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
              Nothing to change
            </h3>
            <p>{r.summary ? `The AI said: ${r.summary}` : 'The AI didn’t suggest anything to add or fix. Try rewording the instruction.'}</p>
            <p className="text-xs text-text-muted">Refine can add shapes and connectors and fix the selected ones. It doesn’t move, resize or restyle anything.</p>
            <Warnings items={r.warnings} />
          </>
        ) : (
          <>
            <div className="flex flex-col gap-1">
              <p className="font-medium">{refineSummary(placement, r.fixes.length)}</p>
              {r.summary && (
                <p className="rounded-md border-l-2 border-accent bg-accent-subtle px-3 py-2">
                  <span className="sr-only">The AI’s summary: </span>
                  {r.summary}
                </p>
              )}
            </div>
            <Preview diagram={preview.diagram} dim={preview.context} />
            <p className="text-xs text-text-muted">
              {preview.context.size ? `Faded: ${count(preview.context.size, 'existing shape')} shown for context. ` : ''}
              {NOTHING_SILENT}
            </p>
            <Story fixes={story.fixes} additions={story.additions} off={off} toggle={toggle} />
            <Warnings items={[...r.warnings, ...(placement.droppedLinks ? [`${count(placement.droppedLinks, 'connector')} to shapes deleted or hidden since will be left out.`] : [])]} />
            {moved && <p className="text-xs text-text-muted">The selection has changed since you sent this. Apply still works on the shapes it was made for.</p>}
            {blocked && (
              <div className="flex flex-col gap-2 rounded-md border border-danger p-3">
                <p>The layer you’re adding to is hidden or locked. Switch to another layer, then choose Apply again.</p>
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
          {r.kind === 'refine' && placement && (
            <Button variant="primary" className={WRAP} onClick={apply} disabled={placement.nodes.length + placement.edges.length + chosen.length === 0} data-autofocus="">
              <Check />
              Apply
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
