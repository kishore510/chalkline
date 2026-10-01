import { ArrowLeft, Archive, CircleHelp, Download, Info, PlayCircle, Settings as SettingsIcon, Trash2, Upload, X } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { announce } from '@/a11y/announce'
import { useAiStore } from '@/ai/aiStore'
import { ConfirmSend } from '@/ai/ConfirmSend'
import { testPlan } from '@/ai/plan'
import { Button } from '@/components/ui/button'
import { useFocusTrap } from '@/components/ui/useFocusTrap'
import { FONT_SIZES, FontPicker } from '@/editor/TextControls'
import { Section, SelectField, ToggleField } from '@/editor/fields'
import { GridDisplayChoice } from '@/editor/ViewMenu'
import { spokenError, type FriendlyError } from '@/errors/friendly'
import { InlineProblem } from '@/errors/InlineProblem'
import { DEFAULT_FONT_ID } from '@/fonts/registry'
import { LearnMore } from '@/help/HelpEntry'
import { useHelpStore } from '@/help/helpStore'
import { LEARN_MORE } from '@/help/links'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { useTheme } from '@/hooks/useTheme'
import { formatBytes, storageUsed } from '@/lib/storage'
import { cn } from '@/lib/utils'
import { useOnboardingStore } from '@/onboarding/onboardingStore'
import type { RestorePlan } from '@/persistence/backup'
import { STORAGE_KEYS } from '@/persistence/storageKeys'
import type { ThemePreference } from '@/lib/theme'
import { MEDIA } from '@/styles/breakpoints'
import { useUiStore } from '@/store/uiStore'
import { APP_VERSION } from '@/version'
import { AiSection } from './AiSection'
import { Choice } from './Choice'
import { checkBackupFile, clearLocalData, exportEverything, restoreBackup } from './dataActions'
import { useSettingsSheet } from './SettingsEntry'
import { updateSettings, useSettingsStore } from './settingsStore'

/*
 * The settings sheet (loaded on first open). Phone: a full-height bottom
 * sheet. Tablet and desktop: a side panel on the right, like Help. Modal,
 * focus kept inside, Escape closes, focus returns to the opener. Changes apply
 * at once and are remembered; nothing here is part of the diagram.
 *
 * Confirmations (restore, clear) are pages of this sheet rather than dialogs
 * on top of it, so there is only ever one focus trap.
 */

/** `back` on the main page: the section to return to (and focus) after a confirmation. */
type Page = { kind: 'main'; back?: 'ai' } | { kind: 'restore'; plan: RestorePlan } | { kind: 'clear' } | { kind: 'ai-confirm' }

const THEMES: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

const ARROWS = [
  { value: 'arrow', label: 'Arrow' },
  { value: 'closed', label: 'Closed' },
  { value: 'none', label: 'None' },
] as const

function Appearance() {
  const { preference, set } = useTheme()
  return (
    <Section title="Appearance">
      <Choice label="Theme" value={preference} options={THEMES} onChange={set} />
      <p className="text-xs text-text-muted">System follows your device’s light or dark setting.</p>
    </Section>
  )
}

function Canvas() {
  const snap = useUiStore((s) => s.snapToGrid)
  const guides = useUiStore((s) => s.smartGuides)
  const setViewPrefs = useUiStore((s) => s.setViewPrefs)
  const arrowhead = useSettingsStore((s) => s.settings.canvas.arrowhead)
  return (
    <Section title="Canvas">
      <ToggleField label="Snap to grid" pressed={snap} onChange={(snapToGrid) => setViewPrefs({ snapToGrid })} />
      <ToggleField label="Smart guides" pressed={guides} onChange={(smartGuides) => setViewPrefs({ smartGuides })} />
      <GridDisplayChoice />
      <Choice label="Arrowhead on new connectors" value={arrowhead} options={[...ARROWS]} onChange={(a) => updateSettings({ canvas: { arrowhead: a } })} />
      <p className="text-xs text-text-muted">Connectors you’ve already drawn keep their arrowheads.</p>
    </Section>
  )
}

function Text() {
  const text = useSettingsStore((s) => s.settings.text)
  return (
    <Section title="Text">
      <p className="text-xs text-text-muted">For new diagrams. Each diagram keeps its own text defaults, which you can change with nothing selected.</p>
      <FontPicker label="Font" value={text.fontFamily} defaultFont={DEFAULT_FONT_ID} onChange={(fontFamily) => updateSettings({ text: { fontFamily } })} />
      <SelectField label="Shape label size" value={text.fontSize} options={FONT_SIZES} onChange={(fontSize) => updateSettings({ text: { fontSize } })} />
    </Section>
  )
}

function useStorageUsed() {
  const [used, setUsed] = useState('checking…')
  useEffect(() => {
    let live = true
    void storageUsed().then((bytes) => live && setUsed(bytes === null ? 'unavailable' : `about ${formatBytes(bytes)}`))
    return () => {
      live = false
    }
  }, [])
  return used
}

function Data({ go }: { go: (page: Page) => void }) {
  const used = useStorageUsed()
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<FriendlyError | null>(null)

  const exportAll = async () => {
    setBusy(true)
    try {
      await exportEverything()
      announce('Backup downloaded.')
    } finally {
      setBusy(false)
    }
  }

  const pickBackup = async (file: File) => {
    setProblem(null)
    const check = await checkBackupFile(file)
    if (check.ok) return go({ kind: 'restore', plan: check.plan })
    setProblem(check.error)
    announce(spokenError(check.error))
  }

  return (
    <Section title="Data">
      <p className="text-xs text-text-muted">Your diagram, stencils and settings are kept in this browser only. A backup file is the way to move them or keep them safe.</p>
      <Button variant="secondary" className="justify-start" disabled={busy} onClick={() => void exportAll()}>
        <Download />
        Export everything
      </Button>
      <Button variant="secondary" className="justify-start" onClick={() => fileRef.current?.click()}>
        <Upload />
        Import backup…
      </Button>
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) void pickBackup(file)
        }}
      />
      {problem && <InlineProblem error={problem} />}
      <p className="flex justify-between gap-4 text-sm">
        <span className="text-text-muted">Storage used</span>
        <span className="tabular-nums">{used}</span>
      </p>
      <Button variant="ghost" className="justify-start text-danger" onClick={() => go({ kind: 'clear' })}>
        <Trash2 />
        Clear local data…
      </Button>
      <LearnMore topic={LEARN_MORE.settings} className="self-start px-0" />
    </Section>
  )
}

function About() {
  const openHelp = useHelpStore((s) => s.openHelp)
  const close = useSettingsSheet((s) => s.closeSettings)
  const startTour = useOnboardingStore((s) => s.startTour)
  return (
    <Section title="About">
      <p className="text-sm text-text">
        Chalkline <span className="tabular-nums">{APP_VERSION}</span>
      </p>
      <Button
        variant="secondary"
        className="justify-start"
        onClick={() => {
          close()
          startTour()
        }}
      >
        <PlayCircle />
        Replay the tour
      </Button>
      <Button
        variant="secondary"
        className="justify-start"
        onClick={() => {
          close()
          openHelp()
        }}
      >
        <CircleHelp />
        Help
      </Button>
      <Button
        variant="secondary"
        className="justify-start"
        onClick={() => {
          close()
          openHelp({ kind: 'about' })
        }}
      >
        <Info />
        Version details and credits
      </Button>
    </Section>
  )
}

/** Runs a confirmed action; a returned problem is shown in place and announced. */
function useConfirmed(action: () => Promise<FriendlyError | null>) {
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<FriendlyError | null>(null)
  const run = async () => {
    setBusy(true)
    setProblem(null)
    const result = await action()
    setBusy(false)
    if (!result) return
    setProblem(result)
    announce(spokenError(result))
  }
  return { busy, problem, run: () => void run() }
}

function ConfirmRestore({ plan, back }: { plan: RestorePlan; back: () => void }) {
  const { busy, problem, run } = useConfirmed(() => restoreBackup(plan))
  const created = plan.created ? new Date(plan.created) : null
  return (
    <div className="flex flex-col gap-4 text-sm text-text">
      <p>
        {created && !Number.isNaN(created.getTime()) ? `This backup was made on ${created.toLocaleString()}. ` : ''}Restoring it replaces what’s in this browser now:
      </p>
      <ul className="flex list-disc flex-col gap-1 pl-5">
        {plan.replaces.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {plan.skippedStencils > 0 && <p className="text-text-muted">{plan.skippedStencils} stencils in the backup couldn’t be read and will be left out.</p>}
      <p className="text-text-muted">This can’t be undone. Export everything first if you want to keep what you have now.</p>
      {problem && <InlineProblem error={problem} />}
      <div className="flex flex-col gap-2">
        <Button variant="secondary" className="justify-start" onClick={() => void exportEverything()}>
          <Download />
          Export everything first
        </Button>
        <Button
          variant="danger"
          className="justify-start"
          disabled={busy}
          onClick={run}
        >
          <Archive />
          Replace and reload
        </Button>
        <Button variant="ghost" className="justify-start" onClick={back} data-autofocus="">
          Cancel
        </Button>
      </div>
    </div>
  )
}

function ConfirmClear({ back }: { back: () => void }) {
  const { busy, problem, run } = useConfirmed(() => clearLocalData())
  const removed = Object.values(STORAGE_KEYS)
    .filter((k) => !('legacy' in k))
    .map((k) => k.what)
  return (
    <div className="flex flex-col gap-4 text-sm text-text">
      <p>This removes everything Chalkline keeps in this browser, then starts afresh:</p>
      <ul className="flex list-disc flex-col gap-1 pl-5">
        {removed.map((what) => (
          <li key={what}>{what}</li>
        ))}
        <li>Your stencil library</li>
      </ul>
      <p className="text-text-muted">This can’t be undone. Files you saved or exported aren’t affected.</p>
      {problem && <InlineProblem error={problem} />}
      <div className="flex flex-col gap-2">
        <Button variant="secondary" className="justify-start" onClick={() => void exportEverything()}>
          <Download />
          Export everything first
        </Button>
        <Button
          variant="danger"
          className="justify-start"
          disabled={busy}
          onClick={run}
        >
          <Trash2 />
          Clear and reload
        </Button>
        <Button variant="ghost" className="justify-start" onClick={back} data-autofocus="">
          Cancel
        </Button>
      </div>
    </div>
  )
}

/** The confirmation for Test key; Send acknowledges the one-time notice and starts the test. */
function AiConfirm({ back }: { back: () => void }) {
  const needsNotice = useSettingsStore((s) => !s.settings.ai.noticeAcknowledged)
  const plan = useMemo(testPlan, [])
  return (
    <ConfirmSend
      plan={plan}
      needsNotice={needsNotice}
      onCancel={back}
      onSend={() => {
        if (needsNotice) updateSettings({ ai: { noticeAcknowledged: true } })
        back()
        void useAiStore.getState().runTest()
      }}
    />
  )
}

const TITLES: Record<Page['kind'], string> = { main: 'Settings', restore: 'Restore this backup?', clear: 'Clear local data?', 'ai-confirm': 'Check before sending' }

function Header({ title, titleId, titleRef, onBack, onClose }: { title: string; titleId: string; titleRef: React.RefObject<HTMLHeadingElement | null>; onBack?: () => void; onClose: () => void }): ReactNode {
  return (
    <div className="flex min-h-touch shrink-0 items-center gap-1 border-b border-border px-1">
      {onBack ? (
        <Button variant="ghost" size="icon" aria-label="Back" title="Back" onClick={onBack}>
          <ArrowLeft />
        </Button>
      ) : (
        <span aria-hidden="true" className="flex size-touch items-center justify-center text-text-muted [&_svg]:size-5">
          <SettingsIcon />
        </span>
      )}
      <h2 ref={titleRef} id={titleId} tabIndex={-1} className="min-w-0 flex-1 truncate text-sm font-semibold outline-none">
        {title}
      </h2>
      <Button variant="ghost" size="icon" aria-label="Close settings" title="Close (Esc)" onClick={onClose} data-autofocus="">
        <X />
      </Button>
    </div>
  )
}

export default function SettingsSheet() {
  const close = useSettingsSheet((s) => s.closeSettings)
  const section = useSettingsSheet((s) => s.section)
  const side = useMediaQuery(MEDIA.tablet)
  const [page, setPage] = useState<Page>({ kind: 'main' })
  const ref = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const titleId = useId()
  const first = useRef(true)
  useFocusTrap(ref, () => (page.kind === 'main' ? close() : setPage({ kind: 'main', ...(page.kind === 'ai-confirm' && { back: 'ai' as const }) })))

  // Opened on a section: scroll it into view.
  useEffect(() => {
    if (section) bodyRef.current?.querySelector(`[data-section="${section}"]`)?.scrollIntoView({ block: 'start' })
  }, [section])

  // New page: back to the top, and focus its title so screen readers announce it.
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    if (page.kind === 'main' && page.back) {
      // Back from a confirmation: to the section it came from, with focus on its action (Test key, or Cancel while testing).
      const section = bodyRef.current?.querySelector<HTMLElement>(`[data-section="${page.back}"]`)
      section?.scrollIntoView({ block: 'start' })
      ;(section?.querySelector<HTMLElement>('[data-ai-focus]') ?? titleRef.current)?.focus()
      return
    }
    bodyRef.current?.scrollTo({ top: 0 })
    if (page.kind === 'main') titleRef.current?.focus()
    else bodyRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus()
  }, [page])

  const main = () => setPage({ kind: 'main', ...(page.kind === 'ai-confirm' && { back: 'ai' as const }) })

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end bg-overlay md:items-stretch md:justify-end" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          'flex w-full flex-col border-border bg-surface text-text shadow-lg',
          side ? 'cl-safe-top h-full max-w-(--cl-settings-width) border-l' : 'h-(--cl-full-sheet-height) rounded-t-lg border-t',
        )}
      >
        <Header title={TITLES[page.kind]} titleId={titleId} titleRef={titleRef} onBack={page.kind === 'main' ? undefined : main} onClose={close} />
        <div ref={bodyRef} className="cl-safe-bottom flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-4 pt-0 pb-4">
          {page.kind === 'main' && (
            <>
              <div data-section="appearance">
                <Appearance />
              </div>
              <div data-section="canvas">
                <Canvas />
              </div>
              <div data-section="text">
                <Text />
              </div>
              <div data-section="ai">
                <AiSection onTest={() => setPage({ kind: 'ai-confirm' })} />
              </div>
              <div data-section="data">
                <Data go={setPage} />
              </div>
              <div data-section="about">
                <About />
              </div>
            </>
          )}
          {page.kind === 'restore' && (
            <div className="pt-4">
              <ConfirmRestore plan={page.plan} back={main} />
            </div>
          )}
          {page.kind === 'ai-confirm' && (
            <div className="pt-4">
              <AiConfirm back={() => setPage({ kind: 'main', back: 'ai' })} />
            </div>
          )}
          {page.kind === 'clear' && (
            <div className="pt-4">
              <ConfirmClear back={main} />
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
