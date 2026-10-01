import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { BACKUP_KEYS, OWNED_DATABASES, OWNED_KEYS } from './storageKeys'

/*
 * Every key the app writes must be in the registry, so "Clear local data"
 * and the backup allowlist stay complete. Checked two ways: the source (no
 * storage access except through localStore.ts, no unregistered key strings),
 * and the real write paths run against a recording storage.
 */

const ROOT = join(import.meta.dirname, '..', '..')
const SRC = join(ROOT, 'src')

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sources(path)
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && name !== 'testStorage.ts' ? [path] : []
  })
}

describe('owned storage keys: source', () => {
  const files = sources(SRC).map((path) => ({ name: relative(ROOT, path), text: readFileSync(path, 'utf8') }))
  files.push({ name: 'index.html', text: readFileSync(join(ROOT, 'index.html'), 'utf8') })

  it('only localStore.ts touches localStorage or sessionStorage directly', () => {
    const offenders = files.filter((f) => f.name !== 'src/persistence/localStore.ts' && f.name !== 'index.html' && /\b(localStorage|sessionStorage)\s*[.?[]/.test(f.text))
    expect(offenders.map((f) => f.name)).toEqual([])
  })

  it('every storage key string in the source is registered', () => {
    const unregistered: string[] = []
    for (const f of files) {
      for (const [, key] of f.text.matchAll(/['"`](chalkline\.[\w.]+)['"`]/g)) if (!OWNED_KEYS.includes(key!)) unregistered.push(`${f.name}: ${key}`)
    }
    expect(unregistered).toEqual([])
  })

  it('the first-paint script in index.html reads only registered keys', () => {
    const html = files.find((f) => f.name === 'index.html')!.text
    const keys = [...html.matchAll(/localStorage\.getItem\('([^']+)'\)/g)].map((m) => m[1])
    expect(keys.length).toBeGreaterThan(0)
    for (const key of keys) expect(OWNED_KEYS).toContain(key)
  })

  it('every key and database is listed once', () => {
    expect(new Set(OWNED_KEYS).size).toBe(OWNED_KEYS.length)
    expect(new Set(BACKUP_KEYS).size).toBe(BACKUP_KEYS.length)
    expect(OWNED_DATABASES.length).toBeGreaterThan(0)
  })
})

describe('owned storage keys: real writes', () => {
  const written = new Set<string>()
  const data = new Map<string, string>()
  const recording = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      written.add(k)
      data.set(k, String(v))
    },
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
    key: () => null,
    length: 0,
  }
  const original = globalThis.localStorage
  globalThis.localStorage = recording as Storage
  afterAll(() => {
    globalThis.localStorage = original
  })

  it('writes only registered keys while using the app', async () => {
    // Old preferences present: the first load migrates them (writes settings).
    data.set('chalkline.theme', 'dark')
    data.set('chalkline.view', '{"snapToGrid":false}')
    const { useSettingsStore } = await import('@/settings/settingsStore')
    const { useUiStore } = await import('@/store/uiStore')
    const { useStencilStore } = await import('@/stencils/stencilStore')
    const { markSeen } = await import('@/help/whatsNew')
    const { saveAutosave, loadAutosave, AUTOSAVE_KEY } = await import('./autosave')
    const { createEmptyDiagram } = await import('@/schema/diagram')

    useSettingsStore.getState().update({ canvas: { grid: 'lines' }, text: { fontSize: 18 }, onboarding: { firstRunDone: true } })
    useUiStore.getState().setViewPrefs({ snapToGrid: true })
    useUiStore.getState().setArrangePrefs({ direction: 'down' })
    useUiStore.getState().setRightPanelCollapsed(true)
    useUiStore.getState().noteShapeUsed('rectangle')
    useStencilStore.getState().noteUsed('s_1')
    markSeen('1.0.0')
    saveAutosave(createEmptyDiagram())
    data.set(AUTOSAVE_KEY, '{broken')
    loadAutosave()

    expect(written.size).toBeGreaterThanOrEqual(6)
    for (const key of written) expect(OWNED_KEYS, `${key} is written but not registered`).toContain(key)
    // The migrated old keys are gone.
    expect(data.has('chalkline.theme')).toBe(false)
    // The dynamic imports pull in most of the app, which is slow on a small machine.
  }, 30_000)
})
