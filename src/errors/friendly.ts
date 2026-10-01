import { redactSecrets } from '@/ai/redact'

/*
 * Every problem the app reports to people, worded in one place so messages
 * stay consistent: what happened (title), what it means (message), what to do
 * next (next), and an optional short technical detail shown behind a
 * "Details" toggle. Pure: no DOM, no stores. Details are always redacted, so
 * an API key can never reach the screen through one.
 */

export type CoreErrorKind =
  | 'file-empty'
  | 'file-type'
  | 'file-not-json'
  | 'file-not-diagram'
  | 'file-is-backup'
  | 'file-is-stencil'
  | 'file-invalid'
  | 'file-newer'
  | 'file-unreadable'
  | 'backup-invalid'
  | 'backup-newer'
  | 'restore-failed'
  | 'clear-failed'
  | 'autosave-full'
  | 'autosave-blocked'
  | 'autosave-corrupt'
  | 'autosave-corrupt-not-kept'
  | 'autosave-newer'
  | 'render-failed'

/** AI request problems; their wording lives in src/ai/messages.ts so it loads with the AI code. */
export type AiErrorKind =
  | 'ai-no-key'
  | 'ai-invalid-key'
  | 'ai-permission'
  | 'ai-billing'
  | 'ai-rate-limited'
  | 'ai-spend-limit'
  | 'ai-overloaded'
  | 'ai-server'
  | 'ai-timeout'
  | 'ai-too-large'
  | 'ai-model-unavailable'
  | 'ai-bad-request'
  | 'ai-offline'
  | 'ai-blocked'
  | 'ai-cancelled'
  | 'ai-unexpected'
  | 'ai-malformed'
  | 'ai-refused'
  | 'ai-truncated'
  | 'ai-review-malformed'
  | 'ai-notes-malformed'

export type ErrorKind = CoreErrorKind | AiErrorKind

export interface FriendlyError {
  kind: ErrorKind
  title: string
  message: string
  /** The suggested next step. */
  next: string
  /** Short technical detail for a "Details" toggle (never shown by default). */
  detail?: string
}

export interface Vars {
  /** Schema version a file or autosave was written with. */
  version?: number
  /** This build's schema version. */
  supported?: number
  /** Seconds to wait before trying again, when the API says. */
  wait?: number
}


const KEEP = 'Your current diagram hasn’t changed.'

/** Wording for a set of kinds: title, message and next step. */
export type MessageTable<K extends ErrorKind> = Record<K, (v: Vars) => Omit<FriendlyError, 'kind' | 'detail'>>

const MESSAGES: MessageTable<CoreErrorKind> = {
  'file-empty': () => ({ title: 'That file is empty', message: `There’s nothing in it to open. ${KEEP}`, next: 'Choose a Chalkline .json file you saved with Save as JSON.' }),
  'file-type': () => ({
    title: 'Chalkline can’t open this type of file',
    message: `Chalkline opens diagrams saved as .json. ${KEEP}`,
    next: 'Choose a .json file you saved with Save as JSON.',
  }),
  'file-not-json': () => ({
    title: 'That file is damaged',
    message: `It looks like a .json file, but its contents are broken or cut short, so it can’t be read. ${KEEP}`,
    next: 'Try an earlier copy of the file, or open it in a text editor to check the end of it.',
  }),
  'file-not-diagram': () => ({
    title: 'That isn’t a Chalkline diagram',
    message: `The file is valid JSON but not a diagram Chalkline saved. ${KEEP}`,
    next: 'Choose a file saved with Save as JSON.',
  }),
  'file-is-backup': () => ({
    title: 'That’s a full backup, not a diagram',
    message: `Backups hold your diagram, stencils and settings together. ${KEEP}`,
    next: 'To restore it, open Settings, then Data, then Import backup.',
  }),
  'file-is-stencil': () => ({
    title: 'That’s a stencil file, not a diagram',
    message: `${KEEP}`,
    next: 'Import it from My stencils in the palette.',
  }),
  'file-invalid': () => ({
    title: 'That diagram has problems',
    message: `Some of its contents don’t make sense (for example a connector to a shape that isn’t there), so it wasn’t opened. ${KEEP}`,
    next: 'If you edited the file by hand, undo those edits. Otherwise try an earlier copy.',
  }),
  'file-newer': (v) => ({
    title: 'Made by a newer version of Chalkline',
    message: `This diagram uses format version ${v.version ?? '?'}; this copy of Chalkline understands up to version ${v.supported ?? '?'}. ${KEEP}`,
    next: 'Reload the page to get the latest Chalkline, then open the file again.',
  }),
  'file-unreadable': () => ({
    title: 'Couldn’t read that file',
    message: `The browser couldn’t read the file. ${KEEP}`,
    next: 'Check the file is still there, then try again.',
  }),
  'backup-invalid': () => ({
    title: 'That isn’t a Chalkline backup',
    message: 'The file isn’t a backup made with Export everything, or it is damaged. Nothing was changed.',
    next: 'Choose a file made with Settings, Data, Export everything.',
  }),
  'backup-newer': (v) => ({
    title: 'Backup from a newer version of Chalkline',
    message: `Its diagram uses format version ${v.version ?? '?'}; this copy understands up to version ${v.supported ?? '?'}. Nothing was changed.`,
    next: 'Reload the page to get the latest Chalkline, then import the backup again.',
  }),
  'restore-failed': () => ({
    title: 'Couldn’t restore the backup',
    message: 'The browser refused to store it (storage may be full or blocked). Everything was put back as it was.',
    next: 'Free some space, or try another browser.',
  }),
  'clear-failed': () => ({
    title: 'Couldn’t clear everything',
    message: 'Some data couldn’t be removed (storage may be blocked).',
    next: 'Use your browser’s site settings to clear data for this site.',
  }),
  'autosave-full': () => ({
    title: 'Autosave failed: storage is full',
    message: 'Your latest changes aren’t saved in this browser and will be lost if you close this tab.',
    next: 'Export JSON now to keep a copy. Chalkline tries again on your next change.',
  }),
  'autosave-blocked': () => ({
    title: 'Autosave is off: storage is blocked',
    message: 'This browser isn’t letting Chalkline save (private browsing or site-data settings). Your work will be lost when you close this tab.',
    next: 'Export JSON now to keep a copy.',
  }),
  'autosave-corrupt': () => ({
    title: 'Your autosaved diagram couldn’t be read',
    message: 'Chalkline started with an empty diagram. A copy of the damaged data was kept in this browser.',
    next: 'Export the recovered data to keep it, or open a JSON copy you saved earlier.',
  }),
  'autosave-corrupt-not-kept': () => ({
    title: 'Your autosaved diagram couldn’t be read',
    message: 'Chalkline started with an empty diagram. Autosave is paused so the damaged data isn’t overwritten.',
    next: 'Export the recovered data to keep it, or open a JSON copy you saved earlier.',
  }),
  'autosave-newer': (v) => ({
    title: 'Your saved diagram is from a newer version',
    message: `It uses format version ${v.version ?? '?'}; this copy of Chalkline understands up to version ${v.supported ?? '?'}. Autosave is paused so it isn’t overwritten.`,
    next: 'Reload the page to get the latest Chalkline.',
  }),
  'render-failed': () => ({
    title: 'Chalkline couldn’t show this diagram',
    message: 'Something in it stopped the canvas from drawing.',
    next: 'Export it as JSON to keep it, then start a new diagram. Or try again.',
  }),
}

/** Longest technical detail kept, so a huge error never floods the screen. */
export const MAX_DETAIL = 600

/** The message for `kind` from `table`, with an optional technical detail (always redacted). */
export function messageFrom<K extends ErrorKind>(table: MessageTable<K>, kind: K, detail?: string, vars: Vars = {}): FriendlyError {
  const text = table[kind](vars)
  const trimmed = detail === undefined ? undefined : redactSecrets(detail).trim()
  return { kind, ...text, ...(trimmed && { detail: trimmed.length > MAX_DETAIL ? `${trimmed.slice(0, MAX_DETAIL)}…` : trimmed }) }
}

/** The message for `kind`, with an optional technical detail. */
export const friendlyError = (kind: CoreErrorKind, detail?: string, vars: Vars = {}) => messageFrom(MESSAGES, kind, detail, vars)

/** One sentence for the screen-reader live region. */
export const spokenError = (e: FriendlyError) => `${e.title}. ${e.message} ${e.next}`
