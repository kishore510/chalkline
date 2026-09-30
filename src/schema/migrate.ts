import { DiagramSchema, SCHEMA_VERSION, type Diagram } from './diagram'

/** A raw, not-yet-validated document at some schema version. */
export type RawDocument = Record<string, unknown>

/** Upgrades a document from version N to N + 1. Must not mutate its input. */
export type Migration = (doc: RawDocument) => RawDocument

/**
 * Migrations keyed by the version they upgrade *from*.
 * Adding schema version N + 1 means adding `N: (doc) => ...` here plus a test.
 */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {}

export class DiagramLoadError extends Error {
  readonly issues: string[]

  constructor(message: string, issues: string[] = []) {
    super(message)
    this.name = 'DiagramLoadError'
    this.issues = issues
  }
}

function isRecord(value: unknown): value is RawDocument {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Steps a raw document up to `targetVersion` using `migrations`. */
export function runMigrations(
  input: unknown,
  targetVersion: number = SCHEMA_VERSION,
  migrations: Readonly<Record<number, Migration>> = MIGRATIONS,
): RawDocument {
  if (!isRecord(input)) {
    throw new DiagramLoadError('A diagram must be a JSON object.')
  }
  const version = input.schemaVersion
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new DiagramLoadError('This file is missing a valid schemaVersion.')
  }
  if (version > targetVersion) {
    throw new DiagramLoadError(
      `This diagram was saved by a newer version of Chalkline (schema ${version}). Please update the app.`,
    )
  }

  let doc = input
  for (let v = version; v < targetVersion; v++) {
    const migrate = migrations[v]
    if (!migrate) {
      throw new DiagramLoadError(`No migration from schema ${v} to ${v + 1}.`)
    }
    doc = { ...migrate(doc), schemaVersion: v + 1 }
  }
  return doc
}

/** Loads any saved diagram: migrates it to the current version, then validates it. */
export function loadDiagram(input: unknown): Diagram {
  const migrated = runMigrations(input)
  const result = DiagramSchema.safeParse(migrated)
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    throw new DiagramLoadError('This diagram file is not valid.', issues)
  }
  return result.data
}
