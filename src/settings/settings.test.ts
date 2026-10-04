import { describe, expect, it } from 'vitest'
import { STORAGE_KEYS } from '@/persistence/storageKeys'
import { memoryStorage } from '@/persistence/testStorage'
import { loadSettings, mergeSettings, SETTINGS_KEY } from './load'
import { defaultSettings, migrateSettings, parseSettings, parseSettingsText, SETTINGS_MIGRATIONS, SETTINGS_VERSION, type SettingsMigration } from './schema'

const throwing = {
  getItem: () => {
    throw new Error('blocked')
  },
  setItem: () => {
    throw new Error('blocked')
  },
  removeItem: () => {
    throw new Error('blocked')
  },
}

describe('settings validation', () => {
  it('has sensible defaults', () => {
    expect(defaultSettings()).toEqual({
      settingsVersion: SETTINGS_VERSION,
      appearance: { theme: 'system' },
      canvas: { snapToGrid: true, smartGuides: true, grid: 'dots', arrowhead: 'arrow' },
      text: {},
      arrange: { direction: 'right', spacing: 'normal' },
      panels: { paletteWidth: null, paletteCollapsed: false, rightCollapsed: false, logWidth: null, logCollapsed: false },
      onboarding: { firstRunDone: false, tourDone: false },
      ai: { keyStorage: 'session', noticeAcknowledged: false, includeNotes: false },
    })
  })

  it('keeps valid values and replaces only the invalid ones', () => {
    const s = parseSettings({
      settingsVersion: 1,
      appearance: { theme: 'neon' },
      canvas: { snapToGrid: false, smartGuides: 'yes', grid: 'lines', arrowhead: 'closed' },
      text: { fontFamily: 'nunito', fontSize: 400 },
    })
    expect(s.appearance.theme).toBe('system')
    expect(s.canvas).toEqual({ snapToGrid: false, smartGuides: true, grid: 'lines', arrowhead: 'closed' })
    expect(s.text).toEqual({ fontFamily: 'nunito' })
  })

  it('treats a broken section as defaults without touching the others', () => {
    const s = parseSettings({ appearance: 'dark', canvas: null, arrange: { direction: 'down' } })
    expect(s.appearance).toEqual(defaultSettings().appearance)
    expect(s.canvas).toEqual(defaultSettings().canvas)
    expect(s.arrange.direction).toBe('down')
  })

  it('never throws on corrupt settings: junk text, wrong types, arrays', () => {
    for (const text of ['{oops', 'null', '42', '"dark"', '[1,2]', '']) expect(parseSettingsText(text)).toEqual(defaultSettings())
    expect(parseSettingsText(null)).toEqual(defaultSettings())
  })

  it('keeps unknown sections, so a newer version’s settings survive', () => {
    const s = parseSettings({ settingsVersion: 99, future: { provider: 'x' }, appearance: { theme: 'dark' } })
    expect(s.settingsVersion).toBe(99)
    expect((s as Record<string, unknown>).future).toEqual({ provider: 'x' })
    expect(s.appearance.theme).toBe('dark')
  })

  it('merges a patch section by section and validates it', () => {
    const s = mergeSettings(defaultSettings(), { canvas: { grid: 'off' }, text: { fontSize: 7 } })
    expect(s.canvas.grid).toBe('off')
    expect(s.canvas.snapToGrid).toBe(true)
    expect(s.text.fontSize).toBeUndefined()
  })
})

describe('settings v1 to v2: the AI section', () => {
  // Exactly what 0.20.0 wrote.
  const v1 = {
    settingsVersion: 1,
    appearance: { theme: 'dark' },
    canvas: { snapToGrid: false, smartGuides: true, grid: 'lines', arrowhead: 'closed' },
    text: { fontFamily: 'nunito' },
    arrange: { direction: 'down', spacing: 'roomy' },
    panels: { paletteWidth: 300, paletteCollapsed: false, rightCollapsed: true },
    onboarding: { firstRunDone: true, tourDone: true },
  }

  it('has a step to version 2', () => {
    expect(SETTINGS_MIGRATIONS[1]).toBeTypeOf('function')
  })

  it('adds the AI section with safe defaults and keeps every v1 choice', () => {
    const s = parseSettings(v1)
    expect(s.settingsVersion).toBe(SETTINGS_VERSION)
    expect(s.ai).toEqual({ keyStorage: 'session', noticeAcknowledged: false, includeNotes: false })
    const { settingsVersion: _, ...rest } = v1
    expect(s).toMatchObject(rest)
  })

  it('the step itself sets the version and the section', () => {
    expect(SETTINGS_MIGRATIONS[1]!({ settingsVersion: 1, x: 1 })).toEqual({
      settingsVersion: 2,
      x: 1,
      ai: { keyStorage: 'session', noticeAcknowledged: false, includeNotes: false },
    })
  })

  it('replaces anything a v1 file had under ai (never trusted as a choice to remember the key)', () => {
    const s = parseSettings({ ...v1, ai: { keyStorage: 'device', noticeAcknowledged: true, apiKey: 'sk-ant-api03-FAKE-v1-key' } })
    expect(s.ai).toEqual({ keyStorage: 'session', noticeAcknowledged: false, includeNotes: false })
    expect(JSON.stringify(s)).not.toContain('sk-ant')
  })

  it('reads v2 AI choices, falls back field by field, and drops unknown AI fields (no place for a key)', () => {
    expect(parseSettings({ settingsVersion: 2, ai: { keyStorage: 'device', noticeAcknowledged: true, includeNotes: true } }).ai).toEqual({
      keyStorage: 'device',
      noticeAcknowledged: true,
      includeNotes: true,
    })
    const s = parseSettings({ settingsVersion: 2, ai: { keyStorage: 'cloud', includeNotes: 'yes', apiKey: 'sk-ant-api03-FAKE' } })
    expect(s.ai).toEqual({ keyStorage: 'session', noticeAcknowledged: false, includeNotes: false })
    expect(JSON.stringify(s)).not.toContain('sk-ant')
  })

  it('unversioned and corrupt settings still load as current defaults', () => {
    expect(parseSettings({}).ai.keyStorage).toBe('session')
    expect(parseSettingsText('{oops').settingsVersion).toBe(SETTINGS_VERSION)
  })

  it('a v1 settings key in storage loads as the current version', () => {
    const storage = memoryStorage({ [SETTINGS_KEY]: JSON.stringify(v1) })
    const { settings } = loadSettings(storage)
    expect(settings.settingsVersion).toBe(SETTINGS_VERSION)
    expect(settings.appearance.theme).toBe('dark')
    expect(settings.ai.keyStorage).toBe('session')
  })
})

describe('settings migration chain', () => {
  const steps: Record<number, SettingsMigration> = {
    1: (raw) => ({ ...raw, settingsVersion: 2, renamed: raw.old }),
    2: (raw) => ({ ...raw, settingsVersion: 3, added: true }),
  }

  it('walks each step in order', () => {
    expect(migrateSettings({ settingsVersion: 1, old: 'x' }, 3, steps)).toEqual({ settingsVersion: 3, old: 'x', renamed: 'x', added: true })
  })

  it('starts unversioned settings at v1', () => {
    expect(migrateSettings({ old: 'y' }, 2, steps)).toMatchObject({ settingsVersion: 2, renamed: 'y' })
  })

  it('stops safely at a missing, throwing or non-advancing step', () => {
    expect(migrateSettings({ settingsVersion: 1 }, 3, { 1: steps[1]! })).toMatchObject({ settingsVersion: 3 })
    expect(() => migrateSettings({ settingsVersion: 1 }, 2, { 1: () => { throw new Error('bad') } })).not.toThrow()
    expect(migrateSettings({ settingsVersion: 1, a: 1 }, 2, { 1: (r) => ({ ...r, settingsVersion: 1, a: 2 }) })).toMatchObject({ a: 1 })
  })

  it('leaves newer settings as they are', () => {
    expect(migrateSettings({ settingsVersion: 7, x: 1 }, 1, steps)).toEqual({ settingsVersion: 7, x: 1 })
  })

  it('returns an empty object for non-objects', () => {
    for (const raw of [null, 3, 'x', [1]]) expect(migrateSettings(raw)).toEqual({})
  })
})

describe('loading settings and migrating old preference keys', () => {
  const legacy = {
    [STORAGE_KEYS.legacyTheme.key]: 'dark',
    [STORAGE_KEYS.legacyView.key]: JSON.stringify({ snapToGrid: false, smartGuides: false, grid: 'lines' }),
    [STORAGE_KEYS.legacyArrange.key]: JSON.stringify({ direction: 'down', spacing: 'roomy' }),
    [STORAGE_KEYS.legacyRightPanel.key]: JSON.stringify({ collapsed: true }),
    [STORAGE_KEYS.legacyPalette.key]: JSON.stringify({ width: 320, collapsed: true }),
  }

  it('folds every old key into settings and keeps the user’s choices', () => {
    const storage = memoryStorage(legacy)
    const { settings, migrated, removed } = loadSettings(storage)
    expect(settings.appearance.theme).toBe('dark')
    expect(settings.canvas).toMatchObject({ snapToGrid: false, smartGuides: false, grid: 'lines' })
    expect(settings.arrange).toEqual({ direction: 'down', spacing: 'roomy' })
    expect(settings.panels).toEqual({ paletteWidth: 320, paletteCollapsed: true, rightCollapsed: true, logWidth: null, logCollapsed: false })
    expect(settings.onboarding.firstRunDone).toBe(true)
    expect(migrated.sort()).toEqual(Object.keys(legacy).sort())
    expect(removed.sort()).toEqual(Object.keys(legacy).sort())
  })

  it('removes the old keys only after the new key was written', () => {
    const storage = memoryStorage(legacy)
    loadSettings(storage)
    expect([...storage.data.keys()]).toEqual([SETTINGS_KEY])
    expect(parseSettingsText(storage.getItem(SETTINGS_KEY)).appearance.theme).toBe('dark')
  })

  it('keeps the old keys when the new key can’t be written (storage full)', () => {
    const storage = memoryStorage(legacy)
    storage.setItem = () => {
      throw Object.assign(new Error('full'), { name: 'QuotaExceededError' })
    }
    const { settings, removed } = loadSettings(storage)
    expect(settings.appearance.theme).toBe('dark')
    expect(removed).toEqual([])
    expect(storage.data.size).toBe(Object.keys(legacy).length)
  })

  it('skips unreadable old values but still removes their keys', () => {
    const storage = memoryStorage({ [STORAGE_KEYS.legacyView.key]: '{oops', [STORAGE_KEYS.legacyTheme.key]: 'purple' })
    const { settings, removed } = loadSettings(storage)
    expect(settings.canvas).toEqual(defaultSettings().canvas)
    expect(settings.appearance.theme).toBe('system')
    expect(removed).toHaveLength(2)
  })

  it('a later load reads the settings key and migrates nothing', () => {
    const storage = memoryStorage(legacy)
    loadSettings(storage)
    expect(loadSettings(storage)).toMatchObject({ migrated: [], removed: [] })
  })

  it('a first-time visitor gets defaults and nothing is written yet', () => {
    const storage = memoryStorage()
    expect(loadSettings(storage).settings).toEqual(defaultSettings())
    expect(storage.data.size).toBe(0)
  })

  it('someone with an autosave but no old preferences is not a first-time visitor', () => {
    const storage = memoryStorage({ [STORAGE_KEYS.autosave.key]: '{}' })
    expect(loadSettings(storage).settings.onboarding.firstRunDone).toBe(true)
  })

  it('corrupt settings load as defaults without error, and old keys are not re-read', () => {
    const storage = memoryStorage({ [SETTINGS_KEY]: '{not json', [STORAGE_KEYS.legacyTheme.key]: 'dark' })
    expect(loadSettings(storage).settings).toEqual(defaultSettings())
  })

  it('works with storage blocked or missing', () => {
    expect(loadSettings(throwing).settings).toEqual(defaultSettings())
    expect(loadSettings(undefined).settings).toEqual(defaultSettings())
  })
})

describe('settings v2 to v3: the AI change log panel', () => {
  // Exactly what 0.21.0 to 0.28.0 wrote.
  const v2 = {
    settingsVersion: 2,
    appearance: { theme: 'light' },
    panels: { paletteWidth: 320, paletteCollapsed: true, rightCollapsed: false },
    ai: { keyStorage: 'device', noticeAcknowledged: true, includeNotes: true },
  }

  it('is version 3', () => {
    expect(SETTINGS_VERSION).toBe(3)
    expect(SETTINGS_MIGRATIONS[2]).toBeTypeOf('function')
  })

  it('adds the log width and collapsed state, keeping every v2 panel and AI choice', () => {
    const s = parseSettings(v2)
    expect(s.settingsVersion).toBe(3)
    expect(s.panels).toEqual({ paletteWidth: 320, paletteCollapsed: true, rightCollapsed: false, logWidth: null, logCollapsed: false })
    expect(s.ai).toEqual(v2.ai)
    expect(s.appearance.theme).toBe('light')
  })

  it('the step copes with a missing or broken panels section', () => {
    expect(SETTINGS_MIGRATIONS[2]!({ settingsVersion: 2 })).toEqual({ settingsVersion: 3, panels: { logWidth: null, logCollapsed: false } })
    expect(SETTINGS_MIGRATIONS[2]!({ settingsVersion: 2, panels: 'x' })).toEqual({ settingsVersion: 3, panels: { logWidth: null, logCollapsed: false } })
  })

  it('reads v3 choices and falls back field by field', () => {
    expect(parseSettings({ settingsVersion: 3, panels: { logWidth: 400, logCollapsed: true } }).panels).toMatchObject({ logWidth: 400, logCollapsed: true })
    expect(parseSettings({ settingsVersion: 3, panels: { logWidth: -5, logCollapsed: 'yes' } }).panels).toMatchObject({ logWidth: null, logCollapsed: false })
  })
})
