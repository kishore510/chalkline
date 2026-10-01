import { Eye, EyeOff, KeyRound, Loader2, RotateCcw, ShieldCheck, Trash2, X } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { announce } from '@/a11y/announce'
import { useAiStore } from '@/ai/aiStore'
import { cleanKey, forgetKey, looksLikeAnthropicKey, maskedKey, saveKey, setKeyPlace, useKeyStatus, type KeyPlace } from '@/ai/keyStore'
import { AI_MODELS } from '@/ai/models'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Section, ToggleField } from '@/editor/fields'
import { InlineProblem } from '@/errors/InlineProblem'
import { LearnMore } from '@/help/HelpEntry'
import { LEARN_MORE } from '@/help/links'
import { Choice } from './Choice'
import { updateSettings, useSettingsStore } from './settingsStore'

/*
 * Settings > AI: the person's own Anthropic key, where it's kept, a test,
 * and what AI features send. The key is never shown again once saved (only
 * its last four characters) and never sits in the page: the field is
 * emptied on save. Test key goes through the confirmation page first.
 */

/** Long labels wrap instead of being cut off at large text sizes. */
const WRAP = 'h-auto min-h-touch justify-start py-2 text-left whitespace-normal'

const PLACES: { value: KeyPlace; label: string }[] = [
  { value: 'session', label: 'This session only' },
  { value: 'device', label: 'Remember on this device' },
]

const time = (at: number) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

/** The status line: is there a key, where, and how the last test went. */
export function statusText(place: KeyPlace | null, tail: string, sending: boolean, lastTest: { ok: boolean; at: number } | null): string {
  if (!place) return 'No key saved.'
  const where = place === 'device' ? `Key remembered on this device (${maskedKey(tail)}).` : `Key saved for this session only (${maskedKey(tail)}). It’s forgotten when you reload or close the tab.`
  if (sending) return `${where} Testing…`
  if (!lastTest) return `${where} Not tested yet.`
  return `${where} Last test ${lastTest.ok ? 'worked' : 'didn’t work'} at ${time(lastTest.at)}.`
}

function KeyForm({ place, onDone, onCancel }: { place: KeyPlace; onDone: () => void; onCancel?: () => void }) {
  const [draft, setDraft] = useState('')
  const [show, setShow] = useState(false)
  const inputId = useId()
  const hintId = useId()
  const key = cleanKey(draft)
  const odd = key !== '' && !looksLikeAnthropicKey(key)

  const save = () => {
    if (!key) return
    const result = saveKey(key, place)
    // Out of the page straight away: only the masked tail is shown from now on.
    setDraft('')
    setShow(false)
    useAiStore.getState().reset()
    if (result.rememberFailed) announce('Key saved for this session only. This browser wouldn’t let Chalkline remember it.')
    else announce(result.place === 'device' ? 'Key saved and remembered on this device.' : 'Key saved for this session.')
    onDone()
  }

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
    >
      <label htmlFor={inputId} className="text-sm font-medium text-text">
        Anthropic API key
      </label>
      <div className="flex gap-1">
        <Input
          id={inputId}
          type={show ? 'text' : 'password'}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="sk-ant-…"
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          // Keeps password managers from offering to save it.
          data-1p-ignore=""
          data-lpignore="true"
          aria-describedby={hintId}
          className="font-mono"
        />
        <Button type="button" variant="ghost" size="icon" aria-label={show ? 'Hide key' : 'Show key'} aria-pressed={show} title={show ? 'Hide key' : 'Show key'} onClick={() => setShow(!show)}>
          {show ? <EyeOff /> : <Eye />}
        </Button>
      </div>
      <p id={hintId} className="text-xs text-text-muted">
        {odd ? 'This doesn’t look like an Anthropic API key (they start with sk-ant-). You can still save it.' : 'Create one in the Claude Console under API keys. Paste it here.'}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" disabled={!key}>
          <KeyRound />
          Save key
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  )
}

function KeepChoice({ value }: { value: KeyPlace }) {
  const [asking, setAsking] = useState(false)
  const hasKey = useKeyStatus((s) => s.place !== null)
  const warningRef = useRef<HTMLDivElement>(null)
  // The warning gets focus (not the Remember button), so it is read before anything is chosen.
  useEffect(() => {
    if (asking) warningRef.current?.focus()
  }, [asking])

  const choose = (place: KeyPlace) => {
    if (place === value) return setAsking(false)
    // Remembering is the riskier direction: say what it means first.
    if (place === 'device') return setAsking(true)
    setAsking(false)
    setKeyPlace('session')
    announce(hasKey ? 'Key is now kept for this session only, and removed from this browser’s storage.' : 'New keys will be kept for this session only.')
  }

  const remember = () => {
    setAsking(false)
    const result = setKeyPlace('device')
    if (result.rememberFailed) announce('This browser wouldn’t let Chalkline remember the key. It’s kept for this session only.')
    else announce(hasKey ? 'Key remembered on this device.' : 'New keys will be remembered on this device.')
  }

  return (
    <div className="flex flex-col gap-2">
      <Choice label="Keep the key" value={asking ? 'device' : value} options={PLACES} onChange={choose} stacked />
      {asking && (
        <div ref={warningRef} tabIndex={-1} role="group" aria-label="Remember the key on this device?" className="flex flex-col gap-2 rounded-md border border-danger p-3 text-sm text-text">
          <p className="font-semibold">Remember the key on this device?</p>
          <p>It’s stored unencrypted in this browser. Anyone who uses this browser, and other pages on this web address, could read it and spend on your Anthropic account.</p>
          <p>Only choose this on a device that’s yours alone. You can remove the key at any time.</p>
          <div className="flex flex-col gap-2">
            <Button variant="danger" className={WRAP} onClick={remember}>
              Remember on this device
            </Button>
            <Button variant="ghost" className={WRAP} onClick={() => setAsking(false)}>
              Keep for this session only
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export function AiSection({ onTest }: { onTest: () => void }) {
  const { place, tail } = useKeyStatus()
  const keyStorage = useSettingsStore((s) => s.settings.ai.keyStorage)
  const includeNotes = useSettingsStore((s) => s.settings.ai.includeNotes)
  const { sending, lastTest, problem, runTest, cancel, reset } = useAiStore()
  const [replacing, setReplacing] = useState(false)
  const testRef = useRef<HTMLButtonElement>(null)
  const wasSending = useRef(sending)
  // When a test ends, its Cancel button goes: put focus on Test key rather than losing it.
  useEffect(() => {
    if (wasSending.current && !sending && (document.activeElement === document.body || document.activeElement === null)) testRef.current?.focus()
    wasSending.current = sending
  }, [sending])

  const remove = () => {
    forgetKey()
    reset()
    setReplacing(false)
    announce('Key removed from this browser.')
  }

  return (
    <Section title="AI (your own key)">
      <p className="text-xs text-text-muted">
        AI features use your own Anthropic API key, and you pay Anthropic for what you use. Diagram content you choose to send goes to Anthropic’s API. Nothing is sent until you press Send.
      </p>
      <p className="flex gap-2 text-sm text-text">
        <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-text-muted" />
        <span>{statusText(place, tail, sending, lastTest)}</span>
      </p>

      {(!place || replacing) && <KeyForm place={keyStorage} onDone={() => setReplacing(false)} onCancel={replacing ? () => setReplacing(false) : undefined} />}

      {place && !replacing && (
        <div className="flex flex-col gap-2">
          {sending ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex min-h-touch items-center gap-2 text-sm text-text-muted">
                <Loader2 aria-hidden="true" className="size-4 motion-safe:animate-spin" />
                Testing your key…
              </span>
              <Button variant="secondary" onClick={cancel} data-ai-focus="">
                <X />
                Cancel
              </Button>
            </div>
          ) : (
            <Button ref={testRef} variant="secondary" className={WRAP} onClick={onTest} data-ai-focus="">
              <ShieldCheck />
              Test key
            </Button>
          )}
          <Button variant="secondary" className={WRAP} onClick={() => setReplacing(true)} disabled={sending}>
            <KeyRound />
            Replace key
          </Button>
          <Button variant="ghost" className={`${WRAP} text-danger`} onClick={remove}>
            <Trash2 />
            Remove key
          </Button>
        </div>
      )}

      {problem && !sending && (
        <InlineProblem error={problem}>
          {place && (
            <Button variant="secondary" onClick={() => void runTest()}>
              <RotateCcw />
              Retry
            </Button>
          )}
        </InlineProblem>
      )}

      <KeepChoice value={place ?? keyStorage} />

      <ToggleField label="Include notes when sending a diagram" pressed={includeNotes} onChange={(on) => updateSettings({ ai: { includeNotes: on } })} />

      <div className="flex flex-col gap-1 text-xs text-text-muted">
        <p>Models used:</p>
        <ul className="flex list-disc flex-col gap-0.5 pl-5">
          {Object.values(AI_MODELS).map((m) => (
            <li key={m.id}>
              {m.use}: {m.name}
            </li>
          ))}
        </ul>
        <p>Every AI action shows its model and what will be sent, and waits for you to press Send.</p>
      </div>
      <LearnMore topic={LEARN_MORE.ai} className="self-start px-0" />
    </Section>
  )
}
