import { z } from 'zod'
import { ArrowheadSchema, FontIdSchema, FontSizeSchema } from '@/schema/diagram'
import { THEME_PREFERENCES } from '@/lib/theme'

/*
 * App settings: how Chalkline looks and behaves for this person. View and app
 * state only: never part of a diagram file, never an undo step.
 *
 * Has its own version (independent of the diagram schema). Any change to the
 * shape here needs a SETTINGS_VERSION bump and a step in SETTINGS_MIGRATIONS.
 *
 * Every field falls back to its default on its own, so a bad value never costs
 * the user their other choices, and loading never throws. A new section (for
 * example an AI section) is one more entry in SECTIONS.
 */

export const SETTINGS_VERSION = 1

/** A field that falls back to `fallback` when missing or invalid. */
const field = <T extends z.ZodType>(schema: T, fallback: z.infer<T>) => schema.catch(fallback)

/** A section whose fields each fall back on their own; a missing or broken section is all defaults. */
function section<S extends z.ZodRawShape>(shape: S) {
  const schema = z.object(shape)
  return schema.catch(() => schema.parse({}))
}

export const GridDisplaySchema = z.enum(['dots', 'lines', 'off'])

const SECTIONS = {
  appearance: section({
    theme: field(z.enum(THEME_PREFERENCES), 'system'),
  }),
  canvas: section({
    /** Snap to grid (the G key changes this too). */
    snapToGrid: field(z.boolean(), true),
    smartGuides: field(z.boolean(), true),
    /** Only changes what's drawn; snapping is separate. */
    grid: field(GridDisplaySchema, 'dots'),
    /** End arrowhead for new connectors. */
    arrowhead: field(ArrowheadSchema, 'arrow'),
  }),
  /** Text defaults for NEW diagrams; existing diagrams keep their own. */
  text: section({
    fontFamily: field(FontIdSchema.optional(), undefined),
    fontSize: field(FontSizeSchema.optional(), undefined),
  }),
  arrange: section({
    direction: field(z.enum(['right', 'down']), 'right'),
    spacing: field(z.enum(['compact', 'normal', 'roomy']), 'normal'),
  }),
  /** Desktop panels. */
  panels: section({
    /** Palette width in CSS px; null means the token default. */
    paletteWidth: field(z.number().positive().finite().nullable(), null),
    paletteCollapsed: field(z.boolean(), false),
    rightCollapsed: field(z.boolean(), false),
  }),
  onboarding: section({
    /** The first-run welcome has been shown and acted on, or wasn't needed. */
    firstRunDone: field(z.boolean(), false),
    tourDone: field(z.boolean(), false),
  }),
}

/**
 * Unknown top-level entries are kept (`loose`), so settings written by a newer
 * version survive a visit from an older one.
 */
export const SettingsSchema = z
  .object({
    settingsVersion: field(z.number().int().positive(), SETTINGS_VERSION),
    ...SECTIONS,
  })
  .loose()

export type Settings = z.infer<typeof SettingsSchema>
export type SectionName = keyof typeof SECTIONS
export type GridDisplay = z.infer<typeof GridDisplaySchema>
export const SECTION_NAMES = Object.keys(SECTIONS) as SectionName[]

export const defaultSettings = (): Settings => SettingsSchema.parse({})

/* ---------- Migration ---------- */

type RawSettings = Record<string, unknown>
export type SettingsMigration = (raw: RawSettings) => RawSettings

/**
 * Steps keyed by the version they upgrade FROM. v1 is the first version.
 * Example for a future v2:
 *   1: (raw) => ({ ...raw, settingsVersion: 2, ai: { enabled: false } }),
 */
export const SETTINGS_MIGRATIONS: Readonly<Record<number, SettingsMigration>> = {}

const isRecord = (value: unknown): value is RawSettings => typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Steps raw settings up to `target`. Never throws: a missing step stops the
 * walk and field fallbacks fill the rest. Newer settings are left as they are
 * and read as far as this version understands them.
 */
export function migrateSettings(raw: unknown, target = SETTINGS_VERSION, steps: Readonly<Record<number, SettingsMigration>> = SETTINGS_MIGRATIONS): RawSettings {
  if (!isRecord(raw)) return {}
  let doc = raw
  let version = typeof doc.settingsVersion === 'number' && Number.isInteger(doc.settingsVersion) && doc.settingsVersion > 0 ? doc.settingsVersion : 1
  while (version < target) {
    const step = steps[version]
    if (!step) break
    try {
      const next = step(doc)
      const nextVersion = next.settingsVersion
      if (typeof nextVersion !== 'number' || nextVersion <= version) break
      doc = next
      version = nextVersion
    } catch {
      break
    }
  }
  return { ...doc, settingsVersion: Math.max(version, target) }
}

/** Untrusted settings (storage or a backup): migrated, validated, with defaults for anything bad. */
export function parseSettings(raw: unknown): Settings {
  return SettingsSchema.parse(migrateSettings(raw))
}

/** Settings from stored text; junk or a parse failure means defaults. */
export function parseSettingsText(text: string | null): Settings {
  if (text === null) return defaultSettings()
  try {
    return parseSettings(JSON.parse(text))
  } catch {
    return defaultSettings()
  }
}
