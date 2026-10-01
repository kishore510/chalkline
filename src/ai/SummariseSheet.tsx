import { Check, Copy, Download, Loader2, RotateCcw, ScrollText, Settings as SettingsIcon, TriangleAlert, X } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { announce } from '@/a11y/announce'
import { Button } from '@/components/ui/button'
import { ToggleField } from '@/editor/fields'
import { spokenError, type FriendlyError } from '@/errors/friendly'
import { InlineProblem } from '@/errors/InlineProblem'
import { LearnMore } from '@/help/HelpEntry'
import { LEARN_MORE } from '@/help/links'
import { Markdown } from '@/help/Markdown'
import { parseUntrustedMarkdown } from '@/help/markdown'
import { cn } from '@/lib/utils'
import { openSettings } from '@/settings/SettingsEntry'
import { updateSettings, useSettingsStore } from '@/settings/settingsStore'
import { useDiagramStore } from '@/store/diagramStore'
import { AiSheetFrame, ModeSwitch, UsageLine, usePageFocus, WRAP } from './AiSheetFrame'
import { ConfirmSend } from './ConfirmSend'
import { useAiSheet } from './GenerateEntry'
import { getApiKey, useKeyStatus } from './keyStore'
import { aiError } from './messages'
import { AI_MODELS } from './models'
import { limitText, scopeText, styleById, summaryInput, summaryPlan, SUMMARY_STYLES, type SummaryInput, type SummaryScope, type SummaryStyle } from './summaryPrompt'
import { useUsageStore } from './usage'

/*
 * Summarise: choose a style and what to include, check what will be sent,
 * wait (or cancel), then read, copy or download the result. Read-only:
 * nothing is ever written into the diagram. The result is view state: not
 * saved, not an undo step, not in any export, gone when the sheet closes.
 *
 * What's sent is captured when the check step opens, so a selection or edit
 * made later (or while waiting) doesn't change what goes.
 */

type Page = 'compose' | 'confirm' | 'sending' | 'result'

const TITLES: Record<Page, string> = {
  compose: 'Summarise your diagram',
  confirm: 'Check before sending',
  sending: 'Summarising…',
  result: 'Summary',
}

interface Result {
  markdown: string
  cutOff: boolean
  style: SummaryStyle
  scope: SummaryScope
  /** The diagram's title when it was sent: names the download. */
  title: string
}

const count = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`
const items = (input: SummaryInput) => input.built.counts.nodes + input.built.counts.groups

function Choice({ name, checked, onChange, label, hint, first }: { name: string; checked: boolean; onChange: () => void; label: string; hint?: string; first?: boolean }) {
  return (
    <label
      className={cn(
        'flex min-h-touch cursor-pointer items-start gap-3 rounded-md border p-3 text-sm has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent',
        checked ? 'border-accent bg-accent-subtle' : 'border-border',
      )}
    >
      <input type="radio" name={name} checked={checked} onChange={onChange} data-autofocus={first ? '' : undefined} className="mt-0.5 size-4 shrink-0 accent-accent" />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="font-medium text-text">{label}</span>
        {hint && <span className="text-xs text-text-muted">{hint}</span>}
      </span>
    </label>
  )
}

export function SummarisePanel({ active }: { active: boolean }) {
  const close = useAiSheet((s) => s.closeGenerate)
  const hasKey = useKeyStatus((s) => s.place !== null)
  const needsNotice = useSettingsStore((s) => !s.settings.ai.noticeAcknowledged)
  const diagram = useDiagramStore((s) => s.diagram)
  const selection = useDiagramStore((s) => s.selection)

  const [page, setPage] = useState<Page>('compose')
  const [style, setStyle] = useState<SummaryStyle>('short')
  // Something selected when the sheet opens: start with just that.
  const [scope, setScope] = useState<SummaryScope>(() => (useDiagramStore.getState().selection.length > 0 ? 'selection' : 'diagram'))
  const [includeNotes, setIncludeNotes] = useState(false)
  const [includeHidden, setIncludeHidden] = useState(false)
  const [captured, setCaptured] = useState<SummaryInput | null>(null)
  const [problem, setProblem] = useState<FriendlyError | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [copied, setCopied] = useState<'copied' | 'failed' | null>(null)
  const controller = useRef<AbortController | null>(null)

  const bodyRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const styleName = useId()
  const scopeName = useId()

  const options = { style, includeNotes, includeHidden, selection }
  const whole = useMemo(() => summaryInput(diagram, { ...options, scope: 'diagram' }), [diagram, style, includeNotes, includeHidden])
  const selected = useMemo(() => (selection.length ? summaryInput(diagram, { ...options, scope: 'selection' }) : null), [diagram, selection, style, includeNotes, includeHidden])
  const canSelect = selected !== null && items(selected) + selected.hidden > 0
  const effectiveScope: SummaryScope = scope === 'selection' && canSelect ? 'selection' : 'diagram'
  const current = effectiveScope === 'selection' && selected ? selected : whole
  const blocks = useMemo(() => (result ? parseUntrustedMarkdown(result.markdown) : []), [result])

  const shut = () => {
    controller.current?.abort()
    close()
  }
  useEffect(() => () => controller.current?.abort(), [])

  const back = page === 'confirm' ? () => setPage(result ? 'result' : 'compose') : page === 'result' ? () => setPage('compose') : undefined
  usePageFocus(page, bodyRef, titleRef)

  /** Opens the check step with a snapshot of what will be sent. */
  function check(scopeNow: SummaryScope = effectiveScope) {
    const { diagram: now, selection: selectedNow } = useDiagramStore.getState()
    setScope(scopeNow)
    setCaptured(summaryInput(now, { style, scope: scopeNow, selection: [...selectedNow], includeNotes, includeHidden }))
    setProblem(null)
    setPage('confirm')
  }

  async function run(input: SummaryInput) {
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
    announce(`Summarising with ${AI_MODELS.small.name}…`)
    try {
      const { summariseDiagram } = await import('./summarise')
      const outcome = await summariseDiagram(key, input.request, { signal: abort.signal })
      useUsageStore.getState().record(AI_MODELS.small, outcome.ok ? outcome.value.usage : outcome.usage)
      // Closed meanwhile: the request was stopped and there's nothing to show.
      if (!useAiSheet.getState().open) return
      if (!outcome.ok && outcome.reason === 'cancelled') {
        setPage(result ? 'result' : 'compose')
        announce('Summary cancelled. Nothing was changed.')
        return
      }
      if (!outcome.ok) {
        setProblem(outcome.error)
        setPage('compose')
        announce(spokenError(outcome.error))
        return
      }
      setResult({ ...outcome.value, style: input.options.style, scope: input.options.scope, title: useDiagramStore.getState().diagram.meta.title })
      setCopied(null)
      setPage('result')
      announce(`Summary ready${outcome.value.cutOff ? ', but cut off at the end' : ''}. It’s AI-generated and may contain mistakes.`)
    } catch {
      const error = aiError('ai-unexpected', 'Summarising failed before an answer could be read.')
      setProblem(error)
      setPage('compose')
      announce(spokenError(error))
    } finally {
      if (controller.current === abort) controller.current = null
    }
  }

  function copy() {
    if (!result) return
    const done = (state: 'copied' | 'failed') => {
      setCopied(state)
      announce(state === 'copied' ? 'Summary copied as Markdown.' : 'Couldn’t copy. Choose Download instead.')
    }
    const writing = navigator.clipboard?.writeText(result.markdown)
    if (!writing) return done('failed')
    writing.then(
      () => done('copied'),
      () => done('failed'),
    )
  }

  async function download() {
    if (!result) return
    const [{ downloadText }, { summaryFileName }] = await Promise.all([import('@/persistence/download'), import('./summarise')])
    const name = summaryFileName(result.title)
    await downloadText(result.markdown, name, 'text/markdown')
    announce(`Downloaded ${name}.`)
  }

  let body: ReactNode
  if (!hasKey) {
    body = (
      <div className="flex flex-col gap-3 pt-4 text-sm text-text">
        <ModeSwitch />
        <p className="font-semibold">Add your API key first</p>
        <p>Summarise uses your own Anthropic API key, and you pay Anthropic for what it uses. Nothing is sent until you check and press Send.</p>
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
        <LearnMore topic={LEARN_MORE.summarise} className="self-start px-0" />
      </div>
    )
  } else if (page === 'compose') {
    const empty = items(current) === 0
    body = (
      <div className="flex flex-col gap-4 pt-4 text-sm text-text">
        <ModeSwitch />
        <p>A written description of your diagram, to read, copy or download. Nothing in your diagram is changed.</p>
        <fieldset className="flex flex-col gap-2">
          <legend className="pb-1 font-medium">Style</legend>
          {SUMMARY_STYLES.map((s) => (
            <Choice key={s.id} name={styleName} checked={style === s.id} onChange={() => setStyle(s.id)} label={s.name} hint={s.hint} first={style === s.id} />
          ))}
        </fieldset>
        <fieldset className="flex flex-col gap-2">
          <legend className="pb-1 font-medium">What to summarise</legend>
          <Choice name={scopeName} checked={effectiveScope === 'diagram'} onChange={() => setScope('diagram')} label="Whole diagram" hint={count(whole.built.counts.nodes, 'shape')} />
          {canSelect ? (
            <Choice name={scopeName} checked={effectiveScope === 'selection'} onChange={() => setScope('selection')} label="Selected shapes only" hint={count(selected.built.counts.nodes, 'shape')} />
          ) : (
            <p className="text-xs text-text-muted">To summarise part of the diagram, close this, select those shapes, and open Summarise again.</p>
          )}
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
        <p className="text-xs text-text-muted">
          Model: <span className="font-medium text-text">{AI_MODELS.small.name}</span>. Your diagram’s labels, shape types and connections are sent to Anthropic’s API when you press Send.
        </p>
        {empty && <p role="note">{effectiveScope === 'selection' ? 'Nothing selected to summarise.' : 'Your diagram is empty: add some shapes first.'}</p>}
        {problem && (
          <InlineProblem error={problem}>
            {problem.kind !== 'ai-no-key' && (
              <Button variant="secondary" onClick={() => check()} disabled={empty}>
                <RotateCcw />
                Retry
              </Button>
            )}
          </InlineProblem>
        )}
        <Button variant="primary" className={WRAP} disabled={empty} onClick={() => check()}>
          <ScrollText />
          Summarise
        </Button>
        <UsageLine />
        <LearnMore topic={LEARN_MORE.summarise} className="self-start px-0" />
      </div>
    )
  } else if (page === 'confirm' && captured) {
    const selectionFits = captured.options.scope === 'diagram' && selected !== null && items(selected) > 0 && !selected.overLimit
    body = (
      <div className="pt-4">
        <ConfirmSend
          plan={summaryPlan(captured)}
          needsNotice={needsNotice}
          details={[
            { term: 'Scope', value: scopeText(captured.options.scope) },
            { term: 'Style', value: styleById(captured.options.style).name },
          ]}
          limit={
            captured.overLimit
              ? {
                  message: limitText(captured),
                  actions: selectionFits ? (
                    <Button variant="secondary" className={WRAP} onClick={() => check('selection')}>
                      Summarise the selection instead
                    </Button>
                  ) : undefined,
                }
              : undefined
          }
          onCancel={() => setPage(result ? 'result' : 'compose')}
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
          Asking {AI_MODELS.small.name} for a {styleById(captured?.options.style ?? style).name.toLowerCase()}. This usually takes a few seconds.
        </p>
        <Button variant="secondary" className={WRAP} onClick={() => controller.current?.abort()} data-autofocus="">
          <X />
          Cancel
        </Button>
      </div>
    )
  } else if (result) {
    body = (
      <div className="flex flex-col gap-4 pt-4 text-sm text-text">
        <p className="text-xs text-text-muted">
          {styleById(result.style).name}, {scopeText(result.scope).toLowerCase()}. AI-generated: it may contain mistakes, so check it against your diagram.
        </p>
        {result.cutOff && (
          <p role="note" className="flex gap-2 rounded-md border border-border-strong p-3">
            <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-text-muted" />
            The answer reached its length limit, so it ends early. Try a shorter style, or summarise fewer shapes.
          </p>
        )}
        <section aria-label="Summary text" className="rounded-md border border-border p-3 break-words">
          <Markdown blocks={blocks} />
        </section>
        <div className="flex flex-col gap-2">
          <Button variant="primary" className={WRAP} onClick={copy} data-autofocus="">
            {copied === 'copied' ? <Check /> : <Copy />}
            {copied === 'copied' ? 'Copied' : 'Copy (Markdown)'}
          </Button>
          {copied === 'failed' && <p className="text-xs text-text-muted">Couldn’t copy here. Choose Download instead.</p>}
          <Button variant="secondary" className={WRAP} onClick={() => void download()}>
            <Download />
            Download as .md
          </Button>
          <Button variant="secondary" className={WRAP} onClick={() => check(result.scope === 'selection' && canSelect ? 'selection' : 'diagram')}>
            <RotateCcw />
            Regenerate
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
      title={hasKey ? TITLES[page] : TITLES.compose}
      icon={<ScrollText />}
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
