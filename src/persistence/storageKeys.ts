/*
 * Every browser-storage key Chalkline owns, in one list. Nothing else may be
 * written (a test checks the source and the real write paths against this).
 *
 * - "Clear local data" removes exactly these keys and databases.
 * - "Export everything" includes only the keys marked `backup: true`: an
 *   explicit allowlist, never "everything under the prefix".
 *
 * A secret (such as a future API key) must get its own key here with
 * `backup: false`; it must never be a field inside settings, which are backed up.
 */

export interface OwnedKey {
  key: string
  /** Plain-language description, shown when restoring a backup. */
  what: string
  /** Included in "Export everything" backups. */
  backup: boolean
  /** Written by older versions only; read once to migrate, then removed. */
  legacy?: true
}

export const STORAGE_KEYS = {
  settings: { key: 'chalkline.settings', what: 'Settings', backup: true },
  autosave: { key: 'chalkline.autosave', what: 'The current diagram', backup: true },
  recovered: { key: 'chalkline.autosave.unreadable', what: 'A copy of an autosave that couldn’t be read', backup: false },
  recentShapes: { key: 'chalkline.recentShapes', what: 'Recently used shapes', backup: true },
  recentStencils: { key: 'chalkline.recentStencils', what: 'Recently used stencils', backup: true },
  lastSeenVersion: { key: 'chalkline.lastSeenVersion', what: 'Which release notes you’ve seen', backup: false },
  // Preferences from before settings had one key (up to 0.19). Migrated into settings, then removed.
  legacyTheme: { key: 'chalkline.theme', what: 'Theme (old format)', backup: false, legacy: true },
  legacyView: { key: 'chalkline.view', what: 'View options (old format)', backup: false, legacy: true },
  legacyArrange: { key: 'chalkline.arrange', what: 'Arrange options (old format)', backup: false, legacy: true },
  legacyRightPanel: { key: 'chalkline.rightPanel', what: 'Right panel (old format)', backup: false, legacy: true },
  legacyPalette: { key: 'chalkline.palette', what: 'Palette width (old format)', backup: false, legacy: true },
} as const satisfies Record<string, OwnedKey>

export type StorageKeyName = keyof typeof STORAGE_KEYS

/** IndexedDB databases the app owns (the stencil library). */
export const OWNED_DATABASES = ['chalkline'] as const

const all: readonly OwnedKey[] = Object.values(STORAGE_KEYS)

/** Every localStorage key the app may write. */
export const OWNED_KEYS: readonly string[] = all.map((k) => k.key)

/** The backup allowlist. */
export const BACKUP_KEYS: readonly string[] = all.filter((k) => k.backup).map((k) => k.key)

export const LEGACY_KEYS: readonly string[] = all.filter((k) => k.legacy).map((k) => k.key)

export const isOwnedKey = (key: string) => OWNED_KEYS.includes(key)

export const describeKey = (key: string) => all.find((k) => k.key === key)?.what ?? key
