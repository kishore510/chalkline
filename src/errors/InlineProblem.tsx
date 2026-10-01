import { AlertTriangle } from 'lucide-react'
import type { ReactNode } from 'react'
import type { FriendlyError } from './friendly'

/** A problem shown in place (the sheet stays open), with its detail folded away and optional actions. */
export function InlineProblem({ error, children }: { error: FriendlyError; children?: ReactNode }) {
  return (
    <div role="group" aria-label="Problem" className="flex gap-2 rounded-md border border-danger p-3 text-sm text-text">
      <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-danger" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="font-semibold">{error.title}</p>
        <p>{error.message}</p>
        <p>{error.next}</p>
        {error.detail && (
          <details>
            <summary className="flex min-h-touch cursor-pointer items-center font-medium text-text-muted">Details</summary>
            <pre className="font-mono text-xs whitespace-pre-wrap break-words text-text-muted">{error.detail}</pre>
          </details>
        )}
        {children && <div className="flex flex-wrap gap-2 pt-1">{children}</div>}
      </div>
    </div>
  )
}
