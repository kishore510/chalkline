import { AlertTriangle, X } from 'lucide-react'
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Panel } from '@/components/ui/panel'
import { cn } from '@/lib/utils'
import { useErrorStore, type ErrorAction, type ShownError } from './errorStore'
import { friendlyError, type FriendlyError } from './friendly'

/*
 * How problems look: a dialog for something that just failed, a banner for an
 * ongoing problem, and an error boundary so a diagram that can't be drawn
 * never leaves a blank screen. Wording comes from friendly.ts; announcing is
 * done by the error store, so these don't use live regions of their own.
 */

/** The short technical detail, folded away by default. */
function Details({ detail }: { detail?: string }) {
  if (!detail) return null
  return (
    <details className="rounded-md border border-border text-sm">
      <summary className="flex min-h-touch cursor-pointer items-center px-3 font-medium text-text-muted">Details</summary>
      <pre className="overflow-x-auto px-3 pb-3 font-mono text-xs whitespace-pre-wrap break-words text-text-muted">{detail}</pre>
    </details>
  )
}

function Body({ error, note }: { error: FriendlyError; note?: string }) {
  return (
    <div className="flex flex-col gap-2 text-sm text-text">
      <p>{error.message}</p>
      {note && <p className="text-text-muted">{note}</p>}
      <p className="font-medium">{error.next}</p>
      <Details detail={error.detail} />
    </div>
  )
}

function Actions({ actions, done }: { actions: ErrorAction[]; done: () => void }) {
  return actions.map((a) => (
    <Button
      key={a.label}
      variant={a.primary ? 'primary' : 'secondary'}
      onClick={() => {
        done()
        a.run()
      }}
    >
      {a.label}
    </Button>
  ))
}

/** Something just failed (opening a file, restoring a backup). The current diagram is never touched. */
export function ErrorDialog() {
  const shown = useErrorStore((s) => s.dialog)
  const close = useErrorStore((s) => s.closeError)
  if (!shown) return null
  return (
    <Dialog
      key={shown.id}
      title={shown.error.title}
      onClose={close}
      footer={
        <>
          <Actions actions={shown.actions} done={close} />
          <Button variant={shown.actions.some((a) => a.primary) ? 'secondary' : 'primary'} onClick={close} data-autofocus="">
            {shown.actions.length ? 'Cancel' : 'OK'}
          </Button>
        </>
      }
    >
      <Body error={shown.error} note={shown.note} />
    </Dialog>
  )
}

/** An ongoing problem (autosave), shown at the top of the canvas without blocking work. */
export function ErrorBanner() {
  const shown: ShownError | null = useErrorStore((s) => s.banner)
  const clear = useErrorStore((s) => s.clearBanner)
  if (!shown) return null
  return (
    <Panel key={shown.id} role="region" aria-label="Problem" className="pointer-events-auto flex w-full max-w-(--cl-banner-width) gap-2 border-danger py-2 pr-1 pl-3 shadow-lg">
      <AlertTriangle aria-hidden="true" className="mt-2.5 size-5 shrink-0 text-danger" />
      <div className="flex min-w-0 flex-1 flex-col gap-2 py-2">
        <h2 className="text-sm font-semibold text-text">{shown.error.title}</h2>
        <Body error={shown.error} note={shown.note} />
        {shown.actions.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <Actions actions={shown.actions} done={() => {}} />
          </div>
        )}
      </div>
      <Button variant="ghost" size="icon" aria-label="Dismiss" title="Dismiss" onClick={() => clear()} className="shrink-0">
        <X />
      </Button>
    </Panel>
  )
}

interface BoundaryProps {
  children: ReactNode
  /** Recovery actions; each one also resets the boundary so the canvas is drawn again. */
  actions: ErrorAction[]
  className?: string
}

/** Catches a diagram that can't be drawn and offers a way out instead of a blank screen. */
export class RenderErrorBoundary extends Component<BoundaryProps, { error: FriendlyError | null }> {
  state = { error: null as FriendlyError | null }

  static getDerivedStateFromError(error: unknown) {
    return { error: friendlyError('render-failed', error instanceof Error ? error.message : String(error)) }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('Canvas failed to render', error, info.componentStack)
  }

  private reset = () => this.setState({ error: null })

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    const actions: ErrorAction[] = [...this.props.actions, { label: 'Try again', run: () => {} }]
    return (
      <div role="alert" className={cn('flex h-full items-center justify-center overflow-y-auto p-4', this.props.className)}>
        <Panel className="flex max-w-md flex-col gap-3 bg-surface">
          <h2 className="flex items-center gap-2 text-base font-semibold text-text">
            <AlertTriangle aria-hidden="true" className="size-5 shrink-0 text-danger" />
            {error.title}
          </h2>
          <Body error={error} />
          <div className="flex flex-wrap gap-2">
            <Actions actions={actions} done={this.reset} />
          </div>
        </Panel>
      </div>
    )
  }
}
