import { describe, expect, it } from 'vitest'
import { fixtures, stencilFixtures } from '@/fixtures'
import { parseDiagram, SCHEMA_VERSION } from '@/schema/diagram'
import { memoryStorage } from './testStorage'
import { parseStencil, type Stencil } from '@/stencils/format'
import { applyRestore, BACKUP_KIND, buildBackup, clearOwnedData, planRestore, serializeBackup } from './backup'
import { serializeDiagram } from './serialize'
import { BACKUP_KEYS, OWNED_DATABASES, OWNED_KEYS, STORAGE_KEYS } from './storageKeys'

const diagram = parseDiagram(fixtures['web-architecture'])
const stencil: Stencil = parseStencil(stencilFixtures.current)
const meta = { created: '2026-10-01T12:00:00.000Z', appVersion: '0.20.0' }
const current = { title: 'Mine', stencils: 3 }

const SECRET_KEY = 'chalkline.apiKey'
const SECRET = 'sk-test-do-not-leak'

function fullStorage() {
  return memoryStorage({
    [STORAGE_KEYS.settings.key]: JSON.stringify({ settingsVersion: 1, appearance: { theme: 'dark' } }),
    [STORAGE_KEYS.autosave.key]: serializeDiagram(diagram),
    [STORAGE_KEYS.recentShapes.key]: JSON.stringify(['rectangle']),
    [STORAGE_KEYS.lastSeenVersion.key]: '0.19.1',
    [STORAGE_KEYS.recovered.key]: '{broken',
    [SECRET_KEY]: SECRET,
    'chalkline.somethingNew': 'x',
    'another-app': 'y',
  })
}

describe('export everything', () => {
  it('includes only allowlisted keys, plus the stencil library', () => {
    const backup = buildBackup(fullStorage(), [stencil], meta)
    expect(backup.kind).toBe(BACKUP_KIND)
    expect(Object.keys(backup.storage).sort()).toEqual([STORAGE_KEYS.autosave.key, STORAGE_KEYS.recentShapes.key, STORAGE_KEYS.settings.key].sort())
    expect(backup.stencils).toEqual([stencil])
  })

  it('never includes a secret, even one under the app’s prefix', () => {
    const text = serializeBackup(buildBackup(fullStorage(), [], meta))
    expect(text).not.toContain(SECRET)
    expect(text).not.toContain(SECRET_KEY)
    expect(text).not.toContain('somethingNew')
    expect(text).not.toContain('another-app')
  })

  it('the allowlist is a strict subset of the owned keys, and leaves out recovery data and legacy keys', () => {
    for (const key of BACKUP_KEYS) expect(OWNED_KEYS).toContain(key)
    expect(BACKUP_KEYS).not.toContain(STORAGE_KEYS.recovered.key)
    expect(BACKUP_KEYS).not.toContain(STORAGE_KEYS.legacyTheme.key)
  })
})

describe('import backup', () => {
  const backupText = (patch: Record<string, unknown> = {}) => serializeBackup({ ...buildBackup(fullStorage(), [stencil], meta), ...patch })

  it('round-trips: validates, then says what will be replaced', () => {
    const check = planRestore(backupText(), current)
    expect(check.ok).toBe(true)
    if (!check.ok) return
    expect(check.plan.writes.map((w) => w.key).sort()).toEqual([STORAGE_KEYS.autosave.key, STORAGE_KEYS.recentShapes.key, STORAGE_KEYS.settings.key].sort())
    expect(check.plan.stencils).toHaveLength(1)
    expect(check.plan.replaces.join(' ')).toContain('“Mine” is replaced by “' + diagram.meta.title + '”')
    expect(check.plan.replaces.join(' ')).toContain('3 stencils')
    expect(check.plan.replaces.join(' ')).toContain('settings')
  })

  it('never writes keys that aren’t on the allowlist, even if the file has them', () => {
    const text = backupText({ storage: { [SECRET_KEY]: 'evil', [STORAGE_KEYS.lastSeenVersion.key]: '9', 'other-app': 1, [STORAGE_KEYS.settings.key]: {} } })
    const check = planRestore(text, current)
    expect(check.ok && check.plan.writes.map((w) => w.key)).toEqual([STORAGE_KEYS.settings.key])
    expect(check.ok && check.plan.ignored.sort()).toEqual([SECRET_KEY, STORAGE_KEYS.lastSeenVersion.key, 'other-app'].sort())
  })

  it.each([
    ['empty', ''],
    ['not JSON', '{"kind": "chalkline-backup", '],
    ['a diagram', serializeDiagram(diagram)],
    ['some other JSON', '{"hello": 1}'],
    ['no stencil list', JSON.stringify({ kind: BACKUP_KIND, backupVersion: 1, storage: {} })],
  ])('refuses %s as an invalid backup', (_label, text) => {
    const check = planRestore(text, current)
    expect(check.ok).toBe(false)
    if (!check.ok) expect(check.error.kind).toBe('backup-invalid')
  })

  it('refuses a backup with a damaged diagram, with details', () => {
    const check = planRestore(backupText({ storage: { [STORAGE_KEYS.autosave.key]: { ...diagram, edges: [{ id: 'e', source: 'nope', target: 'nope' }] } } }), current)
    expect(check.ok).toBe(false)
    if (!check.ok) {
      expect(check.error.kind).toBe('backup-invalid')
      expect(check.error.detail).toMatch(/does not exist/)
    }
  })

  it('refuses a backup or diagram from a newer version', () => {
    for (const text of [backupText({ backupVersion: 99 }), backupText({ storage: { [STORAGE_KEYS.autosave.key]: { ...diagram, schemaVersion: SCHEMA_VERSION + 1 } } })]) {
      const check = planRestore(text, current)
      expect(check.ok).toBe(false)
      if (!check.ok) expect(check.error.kind).toBe('backup-newer')
    }
  })

  it('skips unreadable stencils and says how many', () => {
    const check = planRestore(backupText({ stencils: [stencil, { kind: 'nope' }] }), current)
    expect(check.ok && check.plan.skippedStencils).toBe(1)
  })

  it('applies the plan: writes the keys and replaces the stencil library', async () => {
    const check = planRestore(backupText(), current)
    if (!check.ok) throw new Error('expected a plan')
    const target = memoryStorage({ [STORAGE_KEYS.settings.key]: '{}' })
    let library: Stencil[] = []
    expect(await applyRestore(check.plan, target, async (s) => void (library = s))).toBeNull()
    expect(parseDiagram(JSON.parse(target.getItem(STORAGE_KEYS.autosave.key)!))).toEqual(diagram)
    expect(JSON.parse(target.getItem(STORAGE_KEYS.settings.key)!).appearance.theme).toBe('dark')
    expect(library).toHaveLength(1)
  })

  it('rolls storage back if a write fails (storage full) or the stencil library can’t be replaced', async () => {
    const check = planRestore(backupText(), current)
    if (!check.ok) throw new Error('expected a plan')
    const before = { [STORAGE_KEYS.settings.key]: '{"mine":true}' }

    const full = memoryStorage(before)
    let writes = 0
    const set = full.setItem
    full.setItem = (k, v) => {
      if (++writes === 2) throw Object.assign(new Error('full'), { name: 'QuotaExceededError' })
      set(k, v)
    }
    const error = await applyRestore(check.plan, full, async () => {})
    expect(error?.kind).toBe('restore-failed')
    expect(Object.fromEntries(full.data)).toEqual(before)

    const ok = memoryStorage(before)
    const failed = await applyRestore(check.plan, ok, async () => {
      throw new Error('IndexedDB blocked')
    })
    expect(failed?.kind).toBe('restore-failed')
    expect(Object.fromEntries(ok.data)).toEqual(before)
  })
})

describe('clear local data', () => {
  it('removes exactly the registered keys and databases, nothing else', async () => {
    const storage = fullStorage()
    for (const key of OWNED_KEYS) storage.setItem(key, 'x')
    const deleted: string[] = []
    const result = await clearOwnedData(storage, async (name) => void deleted.push(name))
    expect(result.removed.sort()).toEqual([...OWNED_KEYS].sort())
    expect(result.failed).toEqual([])
    expect(deleted).toEqual([...OWNED_DATABASES])
    // Not ours (or not registered): left alone.
    expect([...storage.data.keys()].sort()).toEqual(['another-app', 'chalkline.somethingNew', SECRET_KEY].sort())
  })

  it('reports what it couldn’t remove', async () => {
    const storage = memoryStorage({ [STORAGE_KEYS.autosave.key]: 'x' })
    storage.removeItem = () => {
      throw new Error('blocked')
    }
    const result = await clearOwnedData(storage, async () => {
      throw new Error('open in another tab')
    })
    expect(result.failed).toEqual([STORAGE_KEYS.autosave.key, 'IndexedDB chalkline'])
  })
})
