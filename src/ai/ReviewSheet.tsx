import { Check, CircleAlert, Copy, Download, Eye, Info, ListChecks, Loader2, RotateCcw, Settings as SettingsIcon, TriangleAlert, X } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { announce } from '@/a11y/announce'
import { useCanvasActions } from '@/canvas/useCanvasActions'
import { Button } from '@/components/ui/button'
import { ToggleField } from '@/editor/fields'
import { spokenError, type FriendlyError } from '@/errors/friendly'
import { InlineProblem } from '@/errors/InlineProblem'
import { LearnMore } from '@/help/HelpEntry'
import { LEARN_MORE } from '@/help/links'
import { cn } from '@/lib/utils'
import { openSettings } from '@/settings/SettingsEntry'
import { updateSettings, useSettingsStore } from '@/settings/settingsStore'
import { useDiagramStore } from '@/store/diagramStore'
import type { Diagram } from '@/schema/diagram'
import { AiSheetFrame, ModeSwitch, UsageLine, usePageFocus, WRAP } from './AiSheetFrame'
import { ConfirmSend } from './ConfirmSend'
import { useAiSheet } from './GenerateEntry'
import { getApiKey, useKeyStatus } from './keyStore'
import { aiError } from './messages'
import { AI_MODELS } from './models'
import { runLocalChecks } from './reviewChecks'
import { ACCURACY_NOTE, namer, reviewFileName, reviewMarkdown } from './reviewExport'
import { SEVERITY_NAMES, type ReviewFinding, type Severity } from './reviewFindings'
import { ALL_FOCUS, focusNames, limitText, REVIEW_FOCUS, reviewInput, reviewPlan, scopeText, type ReviewFocus, type ReviewInput } from './reviewPrompt'
import { hasChangedSince, shapeTargets, useReviewStore, type ShapeTargets } from './reviewStore'
import type { SummaryScope } from './summaryPrompt'
import { useUsageStore } from './usage'

/*
 * Review: local checks (instant, nothing sent) and an optional AI review
 * (checked and confirmed before sending). Read-only: nothing is written into
 * the diagram. "Show shapes" only changes the selection and the view (and,
 * if asked, which layers are shown). Results are view state in their own
 * store: not saved, not an undo step, not in any export.
 */

type Page = 'compose' | 'confirm' | 'sending' | 'result'

const TITLES: Record<Page, string> = {
  compose: 'Review your diagram',
  confirm: 'Check before sending',
  sending: 'Reviewing…',
  result: 'Review',
}

const count = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`
const items = (input: ReviewInput) => input.built.counts.nodes + input.built.counts.groups

const BOX = 'flex min-h-touch cursor-pointer items-start gap-3 rounded-md border p-3 text-sm has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent'

function Choice({ type = 'radio', name, checked, onChange, label, hint, first }: { type?: 'radio' | 'checkbox'; name?: string; checked: boolean; onChange: () => void; label: string; hint?: string; first?: boolean }) {
  return (
    <label className={cn(BOX, checked ? 'border-accent bg-accent-subtle' : 'border-border')}>
      <input type={type} name={name} checked={checked} onChange={onChange} data-autofocus={first ? '' : undefined} className="mt-0.5 size-4 shrink-0 accent-accent" />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="font-medium text-text">{label}</span>
        {hint && <span className="text-xs text-text-muted">{hint}</span>}
      </span>
    </label>
  )
}

const SEVERITY_ICON: Record<Severity, ReactNode> = {
  high: <TriangleAlert aria-hidden="true" className="size-4 shrink-0 text-danger" />,
  medium: <CircleAlert aria-hidden="true" className="size-4 shrink-0 text-accent" />,
  low: <Info aria-hidden="true" className="size-4 shrink-0 text-text-muted" />,
}

/** Severity as an icon and a word: never colour alone. */
function SeverityMarker({ severity }: { severity: Severity }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 text-xs font-semibold text-text">
      {SEVERITY_ICON[severity]}
      {SEVERITY_NAMES[severity]}
    </span>
  )
}

function Stale() {
  return (
    <p role="note" className="flex gap-2 rounded-md border border-border-strong p-2 text-xs text-text">
      <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-text-muted" />
      The diagram has changed since this review. It’s still here to read, but some of it may be out of date.
    </p>
  )
}

function FindingCard({
  finding,
  diagram,
  pending,
  onShow,
  onShowLayers,
  onCancelShow,
  onDismiss,
}: {
  finding: ReviewFinding
  /** The diagram it's about, for naming its shapes. */
  diagram: Diagram
  /** Some of its shapes are on hidden layers: the choice to show them. */
  pending: ShapeTargets | null
  onShow: () => void
  onShowLayers: () => void
  onCancelShow: () => void
  onDismiss: () => void
}) {
  const titleId = useId()
  const name = useMemo(() => namer(diagram), [diagram])
  const names = finding.shapeIds.map(name)
  return (
    <li>
      <article aria-labelledby={titleId} className="flex flex-col gap-2 rounded-md border border-border p-3 break-words">
        <div className="flex flex-wrap items-start gap-2">
          <SeverityMarker severity={finding.severity} />
          <h4 id={titleId} className="min-w-0 flex-1 font-semibold">
            {finding.title}
          </h4>
        </div>
        {finding.explanation && <p>{finding.explanation}</p>}
        {finding.suggestion && (
          <p>
            <span className="font-medium">Suggestion:</span> {finding.suggestion}
          </p>
        )}
        {names.length > 0 && (
          <p className="text-xs text-text-muted">
            {names.length === 1 ? 'Shape' : 'Shapes'}: {names.slice(0, 8).join(', ')}
            {names.length > 8 ? ` and ${names.length - 8} more` : ''}
          </p>
        )}
        {pending && (
          <div role="group" aria-label="Shapes on hidden layers" className="flex flex-col gap-2 rounded-md border border-border-strong p-2">
            <p className="text-xs">
              {count(pending.hidden, 'of these is', 'of these are')} on {pending.hiddenLayerIds.length === 1 ? 'a hidden layer' : 'hidden layers'}.
            </p>
            <Button variant="secondary" className={WRAP} onClick={onShowLayers} data-show-layers="">
              <Eye />
              Show {pending.hiddenLayerIds.length === 1 ? 'that layer' : 'those layers'} too
            </Button>
            {pending.select.length > 0 && (
              <Button variant="ghost" className={WRAP} onClick={onShow}>
                Only the visible ones
              </Button>
            )}
            <Button variant="ghost" className={WRAP} onClick={onCancelShow}>
              Cancel
            </Button>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {finding.shapeIds.length > 0 && !pending && (
            <Button variant="secondary" onClick={onShow} aria-describedby={titleId}>
              <Eye />
              Show shapes
            </Button>
          )}
          <Button variant="ghost" onClick={onDismiss} aria-describedby={titleId}>
            <X />
            Dismiss
          </Button>
        </div>
      </article>
    </li>
  )
}

export function ReviewPanel({ active }: { active: boolean }) {
  const close = useAiSheet((s) => s.closeGenerate)
  const hasKey = useKeyStatus((s) => s.place !== null)
  const needsNotice = useSettingsStore((s) => !s.settings.ai.noticeAcknowledged)
  const diagram = useDiagramStore((s) => s.diagram)
  const selection = useDiagramStore((s) => s.selection)
  const local = useReviewStore((s) => s.local)
  const ai = useReviewStore((s) => s.ai)
  const dismissed = useReviewStore((s) => s.dismissed)
  const actions = useCanvasActions()

  const [page, setPage] = useState<Page>(() => (useReviewStore.getState().local || useReviewStore.getState().ai ? 'result' : 'compose'))
  const [scope, setScope] = useState<SummaryScope>(() => (useDiagramStore.getState().selection.length > 0 ? 'selection' : 'diagram'))
  const [includeNotes, setIncludeNotes] = useState(false)
  const [includeHidden, setIncludeHidden] = useState(false)
  const [deeper, setDeeper] = useState(false)
  const [focus, setFocus] = useState<readonly ReviewFocus[]>(ALL_FOCUS)
  const [unlabelledConnectors, setUnlabelledConnectors] = useState(false)
  const [captured, setCaptured] = useState<ReviewInput | null>(null)
  const [problem, setProblem] = useState<FriendlyError | null>(null)
  const [copied, setCopied] = useState<'copied' | 'failed' | null>(null)
  const [pending, setPending] = useState<{ id: string; targets: ShapeTargets } | null>(null)
  const controller = useRef<AbortController | null>(null)

  const bodyRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const scopeName = useId()

  const options = { includeNotes, includeHidden, selection, deeper, focus }
  const whole = useMemo(() => reviewInput(diagram, { ...options, scope: 'diagram' }), [diagram, includeNotes, includeHidden, deeper, focus])
  const selected = useMemo(() => (selection.length ? reviewInput(diagram, { ...options, scope: 'selection' }) : null), [diagram, selection, includeNotes, includeHidden, deeper, focus])
  const canSelect = selected !== null && items(selected) + selected.hidden > 0
  const effectiveScope: SummaryScope = scope === 'selection' && canSelect ? 'selection' : 'diagram'
  const current = effectiveScope === 'selection' && selected ? selected : whole

  const shut = () => {
    controller.current?.abort()
    close()
  }
  useEffect(() => () => controller.current?.abort(), [])

  const hasResults = Boolean(local || ai)
  const back = page === 'confirm' ? () => setPage(hasResults ? 'result' : 'compose') : page === 'result' ? () => setPage('compose') : undefined
  usePageFocus(page, bodyRef, titleRef)

  function checkLocally() {
    const now = useDiagramStore.getState().diagram
    const findings = runLocalChecks(now, { unlabelledConnectors })
    useReviewStore.getState().setLocal({ diagram: now, findings })
    setCopied(null)
    setPending(null)
    setPage('result')
    announce(`Local checks done: ${count(findings.length, 'finding')}. Nothing was sent.`)
  }

  /** Opens the check step with a snapshot of what will be sent. */
  function check(scopeNow: SummaryScope = effectiveScope, focusNow: readonly ReviewFocus[] = focus, deeperNow = deeper) {
    const { diagram: now, selection: selectedNow } = useDiagramStore.getState()
    setScope(scopeNow)
    setCaptured(reviewInput(now, { scope: scopeNow, selection: [...selectedNow], includeNotes, includeHidden, deeper: deeperNow, focus: focusNow }))
    setProblem(null)
    setPage('confirm')
  }

  async function run(input: ReviewInput) {
    const key = getApiKey()
    if (!key) {
      setProblem(aiError('ai-no-key'))
      setPage('compose')
      return
    }
    const abort = new AbortController()
    controller.current = abort
    setProblem(null)
    setPage('sending')
    const model = input.request.model
    announce(`Reviewing with ${model.name}…`)
    try {
      const { reviewDiagram } = await import('./review')
      const outcome = await reviewDiagram(key, input, { signal: abort.signal })
      useUsageStore.getState().record(model, outcome.ok ? outcome.value.usage : outcome.usage)
      if (!useAiSheet.getState().open) return
      if (!outcome.ok && outcome.reason === 'cancelled') {
        setPage(hasResults ? 'result' : 'compose')
        announce('Review cancelled. Nothing was changed.')
        return
      }
      if (!outcome.ok) {
        setProblem(outcome.error)
        setPage('compose')
        announce(spokenError(outcome.error))
        return
      }
      const { findings, note, warnings } = outcome.value
      const store = useReviewStore.getState()
      // Local checks on the same snapshot, so both parts are about the same diagram.
      const localFindings = runLocalChecks(input.diagram, { unlabelledConnectors })
      store.setLocal({ diagram: input.diagram, findings: localFindings })
      store.setAi({ diagram: input.diagram, findings, note, warnings, model, scope: input.options.scope, focus: input.options.focus })
      setCopied(null)
      setPending(null)
      setPage('result')
      announce(`Review ready: ${count(findings.length, 'AI finding')} and ${count(localFindings.length, 'local finding')}. AI review can be wrong or miss things.`)
    } catch {
      const error = aiError('ai-unexpected', 'Reviewing failed before an answer could be read.')
      setProblem(error)
      setPage('compose')
      announce(spokenError(error))
    } finally {
      if (controller.current === abort) controller.current = null
    }
  }

  /** Selects and centres a finding's shapes; offers hidden layers first. Never changes the diagram's content. */
  function show(finding: ReviewFinding, showLayers = false) {
    const store = useDiagramStore.getState()
    let targets = shapeTargets(store.diagram, finding.shapeIds)
    if (targets.hidden > 0 && !showLayers && pending?.id !== finding.id) {
      setPending({ id: finding.id, targets })
      announce(`${count(targets.hidden, 'of these shapes is', 'of these shapes are')} on hidden layers. Choose whether to show them.`)
      return
    }
    if (showLayers) {
      // A layer view change, as in search: not an undo step, and not an edit.
      for (const id of targets.hiddenLayerIds) store.setLayerVisible(id, true)
      targets = shapeTargets(useDiagramStore.getState().diagram, finding.shapeIds)
    }
    setPending(null)
    if (targets.select.length === 0) {
      announce(targets.missing ? 'Those shapes are no longer in the diagram.' : 'Nothing to show.')
      return
    }
    useDiagramStore.getState().setSelection(targets.select)
    close()
    const ids = targets.select
    requestAnimationFrame(() => actions.revealItems(ids))
    const extra = [
      ...(targets.collapsed ? [`${count(targets.collapsed, 'is', 'are')} inside a collapsed group, so the group is selected`] : []),
      ...(targets.missing ? [`${count(targets.missing, 'is', 'are')} no longer in the diagram`] : []),
    ]
    announce(`${count(ids.length, 'item')} selected and centred${extra.length ? `; ${extra.join('; ')}` : ''}. Open AI to go back to the review.`)
  }

  function exportText() {
    const title = (ai?.diagram ?? local?.diagram ?? diagram).meta.title
    const visible = (fs: readonly ReviewFinding[]) => fs.filter((f) => !dismissed.has(f.id))
    return {
      title,
      markdown: reviewMarkdown({
        title,
        ...(local && { local: { findings: visible(local.findings), diagram: local.diagram } }),
        ...(ai && { ai: { findings: visible(ai.findings), diagram: ai.diagram, model: ai.model, scope: scopeText(ai.scope), note: ai.note } }),
      }),
    }
  }

  function copy() {
    const done = (state: 'copied' | 'failed') => {
      setCopied(state)
      announce(state === 'copied' ? 'Review copied as Markdown.' : 'Couldn’t copy. Choose Download instead.')
    }
    const writing = navigator.clipboard?.writeText(exportText().markdown)
    if (!writing) return done('failed')
    writing.then(
      () => done('copied'),
      () => done('failed'),
    )
  }

  async function download() {
    const { title, markdown } = exportText()
    const { downloadText } = await import('@/persistence/download')
    const name = reviewFileName(title)
    await downloadText(markdown, name, 'text/markdown')
    announce(`Downloaded ${name}.`)
  }

  const toggleFocus = (id: ReviewFocus) => setFocus((f) => (f.includes(id) ? f.filter((x) => x !== id) : ALL_FOCUS.filter((x) => x === id || f.includes(x))))

  const cards = (findings: readonly ReviewFinding[], about: Diagram) => {
    const shown = findings.filter((f) => !dismissed.has(f.id))
    return (
      <ul className="flex flex-col gap-2">
        {shown.map((f) => (
          <FindingCard
            key={f.id}
            finding={f}
            diagram={about}
            pending={pending?.id === f.id ? pending.targets : null}
            onShow={() => show(f)}
            onShowLayers={() => show(f, true)}
            onCancelShow={() => setPending(null)}
            onDismiss={() => {
              useReviewStore.getState().dismiss(f.id)
              if (pending?.id === f.id) setPending(null)
              announce(`Dismissed “${f.title}”.`)
            }}
          />
        ))}
      </ul>
    )
  }

  let body: ReactNode
  if (page === 'compose' || (!hasKey && page !== 'result')) {
    const empty = items(current) === 0
    body = (
      <div className="flex flex-col gap-4 pt-4 text-sm text-text">
        <ModeSwitch />
        <p>A short list of things worth a second look in your diagram. Nothing in your diagram is changed.</p>
        <section aria-labelledby={`${scopeName}-local`} className="flex flex-col gap-2">
          <h3 id={`${scopeName}-local`} className="font-medium">
            Local checks
          </h3>
          <p className="text-xs text-text-muted">Instant and free. Checked in this browser: nothing is sent. Shapes on hidden layers are left out.</p>
          <ToggleField label="Include connectors without labels" pressed={unlabelledConnectors} onChange={setUnlabelledConnectors} />
          <Button variant="secondary" className={WRAP} onClick={checkLocally} disabled={diagram.nodes.length === 0} data-autofocus="">
            <ListChecks />
            Check locally
          </Button>
        </section>
        <section aria-labelledby={`${scopeName}-ai`} className="flex flex-col gap-3 border-t border-border pt-4">
          <h3 id={`${scopeName}-ai`} className="font-medium">
            AI review
          </h3>
          {!hasKey ? (
            <>
              <p>The AI review uses your own Anthropic API key, and you pay Anthropic for what it uses. Nothing is sent until you check and press Send.</p>
              <Button
                variant="primary"
                className={WRAP}
                onClick={() => {
                  close()
                  openSettings('ai')
                }}
              >
                <SettingsIcon />
                Open Settings, AI
              </Button>
            </>
          ) : (
            <>
              <fieldset className="flex flex-col gap-2">
                <legend className="pb-1 font-medium">What to review</legend>
                <Choice name={scopeName} checked={effectiveScope === 'diagram'} onChange={() => setScope('diagram')} label="Whole diagram" hint={count(whole.built.counts.nodes, 'shape')} />
                {canSelect ? (
                  <Choice name={scopeName} checked={effectiveScope === 'selection'} onChange={() => setScope('selection')} label="Selected shapes only" hint={count(selected.built.counts.nodes, 'shape')} />
                ) : (
                  <p className="text-xs text-text-muted">To review part of the diagram, close this, select those shapes, and open Review again.</p>
                )}
              </fieldset>
              <fieldset className="flex flex-col gap-2">
                <legend className="pb-1 font-medium">Look for</legend>
                {REVIEW_FOCUS.map((f) => (
                  <Choice key={f.id} type="checkbox" checked={focus.includes(f.id)} onChange={() => toggleFocus(f.id)} label={f.name} />
                ))}
                {focus.length === 0 && <p className="text-xs text-text-muted">Choose at least one.</p>}
              </fieldset>
              <div className="flex flex-col gap-1">
                <ToggleField label="Include notes" pressed={includeNotes} onChange={setIncludeNotes} />
                <p className="text-xs text-text-muted">
                  {current.built.counts.notes + current.built.counts.notesLeftOut === 0
                    ? 'No notes here.'
                    : includeNotes
                      ? `${count(current.built.counts.notes, 'note')} will be sent.`
                      : `${count(current.built.counts.notesLeftOut, 'note')} left out.`}
                </p>
              </div>
              {(current.hidden > 0 || includeHidden) && (
                <div className="flex flex-col gap-1">
                  <ToggleField label="Include hidden layers" pressed={includeHidden} onChange={setIncludeHidden} />
                  <p className="text-xs text-text-muted">
                    {includeHidden ? `${count(current.hidden, 'item')} on hidden layers will be sent.` : `${count(current.hidden, 'item')} on hidden layers left out.`}
                  </p>
                </div>
              )}
              <Choice type="checkbox" checked={deeper} onChange={() => setDeeper((d) => !d)} label="Deeper review" hint={`Uses ${AI_MODELS.large.name}, which costs more and takes longer.`} />
              <p className="text-xs text-text-muted">
                Model: <span className="font-medium text-text">{(deeper ? AI_MODELS.large : AI_MODELS.small).name}</span>. Your diagram’s labels, shape types and connections are sent to Anthropic’s API when you press Send.
              </p>
              {empty && <p role="note">{effectiveScope === 'selection' ? 'Nothing selected to review.' : 'Your diagram is empty: add some shapes first.'}</p>}
              {problem && (
                <InlineProblem error={problem}>
                  {problem.kind !== 'ai-no-key' && (
                    <Button variant="secondary" onClick={() => check()} disabled={empty || focus.length === 0}>
                      <RotateCcw />
                      Retry
                    </Button>
                  )}
                </InlineProblem>
              )}
              <Button variant="primary" className={WRAP} disabled={empty || focus.length === 0} onClick={() => check()}>
                <ListChecks />
                Review with AI
              </Button>
            </>
          )}
        </section>
        {hasResults && (
          <Button variant="ghost" className={WRAP} onClick={() => setPage('result')}>
            Back to the last review
          </Button>
        )}
        <UsageLine />
        <LearnMore topic={LEARN_MORE.review} className="self-start px-0" />
      </div>
    )
  } else if (page === 'confirm' && captured) {
    const selectionFits = captured.options.scope === 'diagram' && selected !== null && items(selected) > 0 && !selected.overLimit
    body = (
      <div className="pt-4">
        <ConfirmSend
          plan={reviewPlan(captured)}
          needsNotice={needsNotice}
          details={[
            { term: 'Scope', value: scopeText(captured.options.scope) },
            { term: 'Looking for', value: focusNames(captured.options.focus).join(', ') },
            ...(captured.options.deeper
              ? [{ term: 'Cost', value: `Deeper review uses ${AI_MODELS.large.name}, which costs more per token than ${AI_MODELS.small.name} and thinks before answering, so it uses more tokens.` }]
              : []),
          ]}
          limit={
            captured.overLimit
              ? {
                  message: limitText(captured),
                  actions: selectionFits ? (
                    <Button variant="secondary" className={WRAP} onClick={() => check('selection', captured.options.focus, captured.options.deeper)}>
                      Review the selection instead
                    </Button>
                  ) : undefined,
                }
              : undefined
          }
          onCancel={() => setPage(hasResults ? 'result' : 'compose')}
          onSend={() => {
            if (needsNotice) updateSettings({ ai: { noticeAcknowledged: true } })
            void run(captured)
          }}
        />
      </div>
    )
  } else if (page === 'sending') {
    body = (
      <div className="flex flex-col gap-4 pt-4 text-sm text-text">
        <p className="flex min-h-touch items-center gap-2" role="status">
          <Loader2 aria-hidden="true" className="size-5 shrink-0 motion-safe:animate-spin" />
          Asking {(captured?.request.model ?? AI_MODELS.small).name} to review your diagram. {captured?.options.deeper ? 'A deeper review can take a minute.' : 'This usually takes a few seconds.'}
        </p>
        <Button variant="secondary" className={WRAP} onClick={() => controller.current?.abort()} data-autofocus="">
          <X />
          Cancel
        </Button>
      </div>
    )
  } else {
    const hiddenCount = [...(local?.findings ?? []), ...(ai?.findings ?? [])].filter((f) => dismissed.has(f.id)).length
    body = (
      <div className="flex flex-col gap-4 pt-4 text-sm text-text">
        {local && (
          <section aria-labelledby={`${scopeName}-rl`} className="flex flex-col gap-2">
            <h3 id={`${scopeName}-rl`} className="font-semibold">
              Checked locally, nothing sent
            </h3>
            {hasChangedSince(local.diagram, diagram) && <Stale />}
            {local.findings.length === 0 ? <p className="text-text-muted">The local checks found nothing.</p> : cards(local.findings, local.diagram)}
          </section>
        )}
        {ai && (
          <section aria-labelledby={`${scopeName}-ra`} className="flex flex-col gap-2">
            <h3 id={`${scopeName}-ra`} className="font-semibold">
              AI review
            </h3>
            <p className="text-xs text-text-muted">
              {ai.model.name}, {scopeText(ai.scope).toLowerCase()}. {ACCURACY_NOTE}
            </p>
            {hasChangedSince(ai.diagram, diagram) && <Stale />}
            {ai.note && <p className="rounded-md border border-border p-3">{ai.note}</p>}
            {ai.warnings.length > 0 && (
              <ul className="flex list-disc flex-col gap-1 pl-5 text-xs text-text-muted">
                {ai.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}
            {ai.findings.length === 0 ? <p className="text-text-muted">No AI findings.</p> : cards(ai.findings, ai.diagram)}
          </section>
        )}
        {hiddenCount > 0 && (
          <Button variant="ghost" className={WRAP} onClick={() => useReviewStore.getState().undismissAll()}>
            Show {count(hiddenCount, 'dismissed finding')}
          </Button>
        )}
        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <Button variant="primary" className={WRAP} onClick={copy} data-autofocus="">
            {copied === 'copied' ? <Check /> : <Copy />}
            {copied === 'copied' ? 'Copied' : 'Copy all (Markdown)'}
          </Button>
          {copied === 'failed' && <p className="text-xs text-text-muted">Couldn’t copy here. Choose Download instead.</p>}
          <Button variant="secondary" className={WRAP} onClick={() => void download()}>
            <Download />
            Download as .md
          </Button>
          <Button variant="secondary" className={WRAP} onClick={checkLocally}>
            <ListChecks />
            Check locally again
          </Button>
          {hasKey && (
            <Button
              variant="secondary"
              className={WRAP}
              onClick={() => (ai ? check(ai.scope === 'selection' && canSelect ? 'selection' : 'diagram', ai.focus, ai.model.id === AI_MODELS.large.id) : setPage('compose'))}
            >
              <RotateCcw />
              {ai ? 'Review again with AI' : 'Review with AI…'}
            </Button>
          )}
          <Button variant="ghost" className={WRAP} onClick={() => setPage('compose')}>
            Change options
          </Button>
          <Button variant="ghost" className={WRAP} onClick={shut}>
            Close
          </Button>
        </div>
        <UsageLine />
      </div>
    )
  }

  if (!active) return null
  return (
    <AiSheetFrame
      title={!hasKey && page !== 'result' ? TITLES.compose : TITLES[page]}
      icon={<ListChecks />}
      back={back}
      busy={page === 'sending'}
      onEscape={() => (page === 'sending' ? controller.current?.abort() : page !== 'result' && back ? back() : shut())}
      onClose={shut}
      bodyRef={bodyRef}
      titleRef={titleRef}
    >
      {body}
    </AiSheetFrame>
  )
}
