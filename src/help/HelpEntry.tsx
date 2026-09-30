import { CircleHelp } from 'lucide-react'
import { lazy, Suspense } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { APP_VERSION } from '@/version'
import { useHelpStore } from './helpStore'

/*
 * The small, always-loaded parts of help: buttons and links that open the
 * sheet. The sheet itself and all its content load on first open.
 */

const HelpSheet = lazy(() => import('./HelpSheet'))

/** Renders the help sheet while it's open. */
export function HelpSheetHost() {
  const open = useHelpStore((s) => s.open)
  if (!open) return null
  return (
    <Suspense fallback={null}>
      <HelpSheet />
    </Suspense>
  )
}

/** The "unread release notes" dot. Decorative; the button's label says it in words. */
export function UnseenDot({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn('absolute size-(--cl-badge-dot) rounded-full bg-accent ring-2 ring-surface', className)} />
}

/** Header "?" button (tablet and desktop; phones use the menu). */
export function HelpButton() {
  const unseen = useHelpStore((s) => s.unseen)
  const openHelp = useHelpStore((s) => s.openHelp)
  const label = unseen ? 'Help (new: what’s changed)' : 'Help'
  return (
    <Button variant="ghost" size="icon" aria-label={label} title={`${label} (?)`} aria-haspopup="dialog" onClick={() => openHelp()} className="relative">
      <CircleHelp />
      {unseen && <UnseenDot className="top-2.5 right-2.5" />}
    </Button>
  )
}

/** A quiet link that opens a help topic directly. Touch-sized, inline with hint text. */
export function LearnMore({ topic, className }: { topic: string; className?: string }) {
  const openHelp = useHelpStore((s) => s.openHelp)
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      onClick={() => openHelp({ kind: 'topic', id: topic })}
      className={cn('inline-flex min-h-touch shrink-0 items-center rounded-md px-2 text-sm font-medium text-accent underline-offset-2 hover:underline', className)}
    >
      Learn more
    </button>
  )
}

/** Desktop: the version, small and quiet in a corner of the canvas. Opens About. */
export function VersionTag() {
  const openHelp = useHelpStore((s) => s.openHelp)
  return (
    <button
      type="button"
      aria-label={`Chalkline version ${APP_VERSION}: about`}
      title="About Chalkline"
      aria-haspopup="dialog"
      onClick={() => openHelp({ kind: 'about' })}
      className="pointer-events-auto flex min-h-touch items-center rounded-md px-2 text-xs text-text-muted hover:text-text"
    >
      v{APP_VERSION}
    </button>
  )
}
