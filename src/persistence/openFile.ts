import { friendlyError, type FriendlyError } from '@/errors/friendly'
import { safeParseDiagram, SCHEMA_VERSION, type Diagram } from '@/schema/diagram'
import { issueSummary } from './autosave'

/*
 * Reading a diagram file someone chose to open. Pure: it never touches the
 * store, so a bad file can't replace the current diagram. Every failure comes
 * back as a FriendlyError saying what's wrong and what to do next.
 */

export type DiagramFileResult = { ok: true; diagram: Diagram } | { ok: false; error: FriendlyError }

const fail = (error: FriendlyError): DiagramFileResult => ({ ok: false, error })

const JSON_NAME = /\.json$/i
const JSON_TYPE = /json/i

/** Kinds of Chalkline JSON that aren't diagrams, with where they belong instead. */
const OTHER_KINDS: Record<string, 'file-is-backup' | 'file-is-stencil'> = {
  'chalkline-backup': 'file-is-backup',
  'chalkline-stencil': 'file-is-stencil',
  'chalkline-stencil-library': 'file-is-stencil',
}

export function readDiagramFile(file: { name: string; type?: string }, text: string): DiagramFileResult {
  const named = JSON_NAME.test(file.name) || JSON_TYPE.test(file.type ?? '')
  if (text.trim() === '') return fail(friendlyError('file-empty'))

  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (error) {
    // Not JSON at all: a picture, a document, a .drawio file… or a damaged .json.
    return fail(named ? friendlyError('file-not-json', (error as Error).message) : friendlyError('file-type', file.name ? `File: ${file.name}` : undefined))
  }

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return fail(friendlyError('file-not-diagram', 'The file holds a single value, not a diagram.'))
  const doc = raw as Record<string, unknown>
  const other = typeof doc.kind === 'string' ? OTHER_KINDS[doc.kind] : undefined
  if (other) return fail(friendlyError(other))
  if (!('schemaVersion' in doc) || !('nodes' in doc)) return fail(friendlyError('file-not-diagram', 'No "schemaVersion" or "nodes" in the file.'))

  const version = doc.schemaVersion
  if (typeof version === 'number' && version > SCHEMA_VERSION) {
    return fail(friendlyError('file-newer', `Format version ${version}; supported up to ${SCHEMA_VERSION}.`, { version, supported: SCHEMA_VERSION }))
  }
  const result = safeParseDiagram(raw)
  if (!result.success) return fail(friendlyError('file-invalid', issueSummary(result.error)))
  return { ok: true, diagram: result.data }
}
