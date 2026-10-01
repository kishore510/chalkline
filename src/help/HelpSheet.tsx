import { ArrowLeft, BookOpen, Check, ChevronRight, Copy, Hand, Info, Keyboard, PlayCircle, Rocket, Search, Settings, Sparkles, X } from 'lucide-react'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useFocusTrap } from '@/components/ui/useFocusTrap'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { formatBytes, storageUsed } from '@/lib/storage'
import { cn } from '@/lib/utils'
import { MEDIA } from '@/styles/breakpoints'
import { useOnboardingStore } from '@/onboarding/onboardingStore'
import { openSettings } from '@/settings/SettingsEntry'
import { cheatSheet } from '@/editor/shortcuts'
import { formatVersionDetails, VERSION_INFO } from '@/version'
import { CHANGELOG, CHANGELOG_TEXT, HELP_TOPICS, topicById } from './content'
import { CREDITS, creditFor, HIGHLIGHTS } from './credits'
import { currentView, useHelpStore, type HelpView } from './helpStore'
import { HELP_AREAS } from './links'
import { Markdown } from './Markdown'
import { searchTopics } from './topics'

/*
 * The help sheet (loaded on first open). Phone: a full-height bottom sheet.
 * Tablet and desktop: a side panel on the right. Modal, with focus kept
 * inside, Escape to close and Back to the previous page.
 */

const TITLES: Record<Exclude<HelpView['kind'], 'topic'>, string> = { home: 'Help', 'whats-new': 'What’s new', about: 'About Chalkline', shortcuts: 'Keyboard shortcuts' }
const titleOf = (view: HelpView) => (view.kind === 'topic' ? (topicById(view.id)?.title ?? 'Help') : TITLES[view.kind])

/** A full-width row that opens another page. */
function NavRow({ icon, title, detail, onClick, badge }: { icon?: ReactNode; title: string; detail?: string; onClick: () => void; badge?: string }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex min-h-touch w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-surface-muted active:bg-surface-muted"
      >
        {icon && <span className="shrink-0 text-text-muted [&_svg]:size-5">{icon}</span>}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="font-medium text-text">{title}</span>
          {detail && <span className="line-clamp-2 text-xs text-text-muted">{detail}</span>}
        </span>
        {badge && <span className="shrink-0 rounded-full bg-accent px-2 text-xs font-semibold text-on-accent">{badge}</span>}
        <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-text-muted" />
      </button>
    </li>
  )
}

const SectionTitle = ({ children }: { children: ReactNode }) => <h3 className="px-3 text-xs font-semibold tracking-wide text-text-muted uppercase">{children}</h3>

/** `query` lives in the sheet, so Back from a topic returns to the same results. */
function Home({ go, autoFocusSearch, query, setQuery }: { go: (view: HelpView) => void; autoFocusSearch: boolean; query: string; setQuery: (query: string) => void }) {
  const unseen = useHelpStore((s) => s.unseen)
  const results = searchTopics(HELP_TOPICS, query)
  const topic = (id: string) => go({ kind: 'topic', id })
  const quickStart = topicById(HELP_AREAS.quickStart)
  const gestures = topicById(HELP_AREAS.gestures)
  const areas = new Set<string>(Object.values(HELP_AREAS))

  return (
    <div className="flex flex-col gap-4">
      <label className="relative block">
        <span className="sr-only">Search help</span>
        <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-muted" />
        <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search help" className="pl-9" data-autofocus={autoFocusSearch || undefined} />
      </label>

      {query.trim() ? (
        <section aria-label="Search results" className="flex flex-col gap-1" aria-live="polite">
          {results.length === 0 ? (
            <p className="px-3 text-sm text-text-muted">No topics match “{query.trim()}”. Try a different word, like “arrow” or “export”.</p>
          ) : (
            <ul className="flex flex-col">
              {results.map((r) => (
                <NavRow key={r.topic.id} title={r.topic.title} detail={r.snippet} onClick={() => topic(r.topic.id)} />
              ))}
            </ul>
          )}
        </section>
      ) : (
        <>
          {quickStart && (
            <button
              type="button"
              onClick={() => topic(quickStart.id)}
              className="flex min-h-touch items-center gap-3 rounded-lg border border-border bg-accent-subtle p-4 text-left transition-colors hover:border-accent"
            >
              <Rocket aria-hidden="true" className="size-6 shrink-0 text-accent" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm font-semibold text-text">Quick start</span>
                <span className="text-xs text-text-muted">Your first diagram, and the Select, Pan and Link modes.</span>
              </span>
              <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-text-muted" />
            </button>
          )}
          <section aria-label="Topics" className="flex flex-col gap-1">
            <SectionTitle>Topics</SectionTitle>
            <ul className="flex flex-col">
              {HELP_TOPICS.filter((t) => !areas.has(t.id)).map((t) => (
                <NavRow key={t.id} title={t.title} onClick={() => topic(t.id)} />
              ))}
            </ul>
          </section>
          <section aria-label="More" className="flex flex-col gap-1">
            <SectionTitle>More</SectionTitle>
            <ul className="flex flex-col">
              <NavRow
                icon={<PlayCircle />}
                title="Take the tour"
                detail="The Select, Pan and Link modes, in four steps"
                onClick={() => {
                  useHelpStore.getState().closeHelp()
                  useOnboardingStore.getState().startTour()
                }}
              />
              <NavRow
                icon={<Settings />}
                title="Settings"
                detail="Theme, canvas and text defaults, backup and restore"
                onClick={() => {
                  useHelpStore.getState().closeHelp()
                  openSettings()
                }}
              />
              {gestures && <NavRow icon={<Hand />} title={gestures.title} detail="Touch, mouse and keyboard" onClick={() => topic(gestures.id)} />}
              <NavRow icon={<Keyboard />} title="Keyboard shortcuts" detail="Every shortcut, for Mac and Windows / Linux" onClick={() => go({ kind: 'shortcuts' })} />
              <NavRow icon={<Sparkles />} title="What’s new" detail={`Version ${VERSION_INFO.version}`} badge={unseen ? 'New' : undefined} onClick={() => go({ kind: 'whats-new' })} />
              <NavRow icon={<Info />} title="About" detail="Version, storage and credits" onClick={() => go({ kind: 'about' })} />
            </ul>
          </section>
        </>
      )}
    </div>
  )
}

function TopicPage({ id, go }: { id: string; go: (view: HelpView) => void }) {
  const topic = topicById(id)
  if (!topic) return <p className="text-sm text-text-muted">This topic isn’t available.</p>
  return <Markdown blocks={topic.blocks} onTopic={(next) => go({ kind: 'topic', id: next })} />
}

/** Key caps for each way to press a shortcut, e.g. "Ctrl Shift Z" or "Ctrl Y". */
function Keys({ combos }: { combos: string[][] }) {
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {combos.map((caps, i) => (
        <span key={i} className="inline-flex flex-wrap items-center gap-1">
          {i > 0 && <span className="text-xs text-text-muted">or</span>}
          {caps.map((cap, j) => (
            <kbd key={j} className="rounded-sm border border-border-strong bg-surface-muted px-1.5 font-sans text-xs font-medium text-text">
              {cap}
            </kbd>
          ))}
        </span>
      ))}
    </span>
  )
}

/** The cheat sheet (also opened with ?), from the same table the shortcuts run from. */
function Shortcuts({ go }: { go: (view: HelpView) => void }) {
  return (
    <div className="flex flex-col gap-5 text-sm text-text">
      <p className="text-text-muted">
        Every action also has a button or menu item; shortcuts are only quicker.{' '}
        <button type="button" className="inline-flex min-h-touch items-center font-medium text-accent underline-offset-2 hover:underline" onClick={() => go({ kind: 'topic', id: HELP_AREAS.gestures })}>
          Touch and mouse gestures
        </button>
      </p>
      {cheatSheet().map((section) => (
        <table key={section.area} className="w-full border-collapse text-left">
          <caption className="pb-1 text-left text-xs font-semibold tracking-wide text-text-muted uppercase">{section.area}</caption>
          <thead className="text-xs text-text-muted">
            <tr>
              <th scope="col" className="pb-1 font-normal">
                <span className="sr-only">Action</span>
              </th>
              <th scope="col" className="pb-1 pr-2 font-normal">
                Windows / Linux
              </th>
              <th scope="col" className="pb-1 font-normal">
                Mac
              </th>
            </tr>
          </thead>
          <tbody>
            {section.rows.map((row) => (
              <tr key={row.label} className="border-t border-border align-top">
                <th scope="row" className="py-2 pr-2 font-normal">
                  {row.label}
                </th>
                <td className="py-2 pr-2">
                  <Keys combos={row.other} />
                </td>
                <td className="py-2">
                  <Keys combos={row.mac} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ))}
      <p className="pb-4 text-xs text-text-muted">Shortcuts don’t apply while you’re typing in a field, the search box or a label.</p>
    </div>
  )
}

const formatDate = (iso: string) => {
  const date = new Date(`${iso}T00:00:00`)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function WhatsNew() {
  if (!CHANGELOG) {
    // Couldn't parse the file: show it as it is rather than nothing.
    return <pre className="font-sans text-sm whitespace-pre-wrap text-text">{CHANGELOG_TEXT}</pre>
  }
  return (
    <ol className="flex flex-col gap-5">
      {CHANGELOG.map((release) => {
        const current = release.version === VERSION_INFO.version
        return (
          <li key={release.version} className={cn('flex flex-col gap-2', current && 'rounded-lg border border-accent p-3')} aria-current={current ? 'true' : undefined}>
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <h3 className="text-base font-semibold text-text">{release.version}</h3>
              {release.date && <span className="text-xs text-text-muted">{formatDate(release.date)}</span>}
              {current && <span className="rounded-full bg-accent px-2 text-xs font-semibold text-on-accent">This version</span>}
            </div>
            {release.sections.map((section) => (
              <section key={section.title} aria-label={`${release.version} ${section.title}`} className="flex flex-col gap-1">
                <h4 className="text-xs font-semibold tracking-wide text-text-muted uppercase">{section.title}</h4>
                <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-text">
                  {section.items.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </section>
            ))}
          </li>
        )
      })}
    </ol>
  )
}

function useStorageUsed() {
  const [used, setUsed] = useState<string>('checking…')
  useEffect(() => {
    let live = true
    void storageUsed().then((bytes) => live && setUsed(bytes === null ? 'unavailable' : `about ${formatBytes(bytes)}`))
    return () => {
      live = false
    }
  }, [])
  return used
}

function CopyDetails() {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const details = formatVersionDetails(VERSION_INFO, navigator.userAgent)
  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="secondary"
        className="self-start"
        onClick={() => {
          const copy = navigator.clipboard?.writeText(details)
          if (!copy) return setState('failed')
          copy.then(
            () => setState('copied'),
            () => setState('failed'),
          )
        }}
      >
        {state === 'copied' ? <Check /> : <Copy />}
        {state === 'copied' ? 'Copied' : 'Copy details'}
      </Button>
      <p className="text-xs text-text-muted" aria-live="polite">
        {state === 'failed' ? 'Couldn’t copy. Select the text below and copy it instead.' : 'For bug reports: version, build, format and browser.'}
      </p>
      {state === 'failed' && (
        <textarea readOnly value={details} rows={5} onFocus={(e) => e.currentTarget.select()} className="w-full rounded-md border border-border-strong bg-surface p-2 font-mono text-xs text-text" />
      )}
    </div>
  )
}

function About() {
  const storage = useStorageUsed()
  const built = VERSION_INFO.buildDate ? new Date(VERSION_INFO.buildDate) : null
  const rows: [string, string][] = [
    ['Version', VERSION_INFO.version],
    ['Build', VERSION_INFO.commit],
    ['Built', built && !Number.isNaN(built.getTime()) ? built.toLocaleString() : 'unknown'],
    ['Diagram format', `version ${VERSION_INFO.schemaVersion}`],
    ['Storage used', storage],
  ]
  const highlighted = new Set(HIGHLIGHTS.map((h) => h.name))
  return (
    <div className="flex flex-col gap-5 text-sm text-text">
      <p>
        <span className="font-semibold">Chalkline</span>: ideas to diagrams.
      </p>
      <dl className="flex flex-col gap-2">
        {rows.map(([term, value]) => (
          <div key={term} className="flex gap-4">
            <dt className="w-28 shrink-0 text-text-muted">{term}</dt>
            <dd className="min-w-0 break-words tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <CopyDetails />

      <section aria-label="Privacy" className="flex flex-col gap-1">
        <h3 className="text-base font-semibold">Privacy</h3>
        <p>No analytics, no tracking and no network requests. Your diagrams, stencils and settings stay in this browser until you save or export them.</p>
      </section>

      <section aria-label="Credits" className="flex flex-col gap-2">
        <h3 className="text-base font-semibold">Credits</h3>
        <p>Chalkline is built with these open-source projects. Thank you to their authors.</p>
        <ul className="flex flex-col gap-2">
          {HIGHLIGHTS.map((h) => {
            const credit = creditFor(h.name)
            return (
              <li key={h.name}>
                <span className="font-medium">{h.title}</span>
                {credit && <span className="text-text-muted"> · {credit.license}</span>}
                <br />
                <span className="text-text-muted">{h.role}</span>
              </li>
            )
          })}
        </ul>
        <details className="rounded-md border border-border">
          <summary className="flex min-h-touch cursor-pointer items-center px-3 font-medium">All bundled packages ({CREDITS.length})</summary>
          <ul className="flex flex-col gap-1 px-3 pb-3 text-xs">
            {CREDITS.map((c) => (
              <li key={c.name} className={cn('flex flex-wrap justify-between gap-x-2', highlighted.has(c.name) && 'font-medium')}>
                <span className="min-w-0 break-all">
                  {c.name} {c.version}
                </span>
                <span className="text-text-muted">{c.license}</span>
              </li>
            ))}
          </ul>
        </details>
      </section>
    </div>
  )
}

export default function HelpSheet() {
  const stack = useHelpStore((s) => s.stack)
  const go = useHelpStore((s) => s.go)
  const back = useHelpStore((s) => s.back)
  const close = useHelpStore((s) => s.closeHelp)
  const side = useMediaQuery(MEDIA.tablet)
  const finePointer = useMediaQuery(MEDIA.finePointer)
  const view = currentView(stack)
  const ref = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const titleId = useId()
  const shown = useRef(stack)
  const [query, setQuery] = useState('')
  useFocusTrap(ref, close)

  // New page: back to the top, and move focus to its title so screen readers announce it.
  useEffect(() => {
    if (shown.current === stack) return
    shown.current = stack
    bodyRef.current?.scrollTo({ top: 0 })
    titleRef.current?.focus()
  }, [stack])

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end bg-overlay md:items-stretch md:justify-end" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          'flex w-full flex-col border-border bg-surface text-text shadow-lg',
          side ? 'cl-safe-top h-full max-w-(--cl-help-width) border-l' : 'h-(--cl-full-sheet-height) rounded-t-lg border-t',
        )}
      >
        <div className="flex min-h-touch shrink-0 items-center gap-1 border-b border-border px-1">
          {stack.length > 1 ? (
            <Button variant="ghost" size="icon" aria-label="Back" title="Back" onClick={back}>
              <ArrowLeft />
            </Button>
          ) : (
            <span aria-hidden="true" className="flex size-touch items-center justify-center text-text-muted [&_svg]:size-5">
              <BookOpen />
            </span>
          )}
          <h2 ref={titleRef} id={titleId} tabIndex={-1} className="min-w-0 flex-1 truncate text-sm font-semibold outline-none">
            {titleOf(view)}
          </h2>
          <Button variant="ghost" size="icon" aria-label="Close help" title="Close (Esc)" onClick={close} data-autofocus={view.kind === 'home' && finePointer ? undefined : true}>
            <X />
          </Button>
        </div>
        <div ref={bodyRef} className="cl-safe-bottom min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-4">
          {view.kind === 'home' && <Home go={go} autoFocusSearch={finePointer} query={query} setQuery={setQuery} />}
          {view.kind === 'topic' && <TopicPage id={view.id} go={go} />}
          {view.kind === 'whats-new' && <WhatsNew />}
          {view.kind === 'about' && <About />}
          {view.kind === 'shortcuts' && <Shortcuts go={go} />}
        </div>
      </div>
    </div>,
    document.body,
  )
}
