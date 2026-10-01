import { Info, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ToggleField } from '@/editor/fields'
import { sizeText, type SendPlan } from './plan'

/*
 * The step before every AI request: which model, what is included, how big it
 * is, and Send or Cancel. Nothing is sent until Send is pressed. The first
 * time, it also carries the one-time notice that content leaves the device;
 * pressing Send acknowledges it. Cancel is focused first.
 */

export const NOTICE_TITLE = 'Before your first AI request'

export function ConfirmSend({
  plan,
  needsNotice,
  onSend,
  onCancel,
  notes,
}: {
  plan: SendPlan
  needsNotice: boolean
  onSend: () => void
  onCancel: () => void
  /** The "include notes" toggle, for actions that send diagram content. */
  notes?: { include: boolean; onChange: (include: boolean) => void }
}) {
  return (
    <div className="flex flex-col gap-4 text-sm text-text">
      {needsNotice && (
        <div role="note" aria-label={NOTICE_TITLE} className="flex gap-2 rounded-md border border-accent bg-accent-subtle p-3">
          <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-accent" />
          <div className="flex min-w-0 flex-col gap-1">
            <p className="font-semibold">{NOTICE_TITLE}</p>
            <p>What you send leaves this device and goes to Anthropic’s API, using your key and your Anthropic account.</p>
            <p>Check your own (or your organisation’s) rules for handling data before sending anything sensitive. This notice is shown once.</p>
          </div>
        </div>
      )}
      <dl className="flex flex-col gap-3">
        <div className="flex flex-col gap-0.5">
          <dt className="text-text-muted">Model</dt>
          <dd>
            <span className="font-medium">{plan.model.name}</span> <span className="font-mono text-xs break-all text-text-muted">({plan.model.id})</span>
          </dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-text-muted">What’s sent</dt>
          <dd>
            <ul className="flex list-disc flex-col gap-1 pl-5">
              {plan.includes.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-text-muted">Size</dt>
          <dd className="tabular-nums">{sizeText(plan)}</dd>
        </div>
      </dl>
      {notes && <ToggleField label="Include notes" pressed={notes.include} onChange={notes.onChange} />}
      <p className="text-text-muted">It goes straight from this browser to api.anthropic.com. Chalkline has no server of its own.</p>
      <div className="flex flex-col gap-2">
        <Button variant="primary" className="justify-start" onClick={onSend}>
          <Send />
          Send
        </Button>
        <Button variant="ghost" className="justify-start" onClick={onCancel} data-autofocus="">
          Cancel
        </Button>
      </div>
    </div>
  )
}
