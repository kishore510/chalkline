import { beforeEach, describe, expect, it } from 'vitest'
import { APP_VERSION } from '@/version'
import { currentView, useHelpStore } from './helpStore'
import { LAST_SEEN_KEY } from './whatsNew'

const help = () => useHelpStore.getState()

const stored = new Map<string, string>()
globalThis.localStorage = { getItem: (k: string) => stored.get(k) ?? null, setItem: (k: string, v: string) => void stored.set(k, v) } as Storage

describe('help sheet state', () => {
  beforeEach(() => {
    stored.clear()
    useHelpStore.setState({ open: false, stack: [{ kind: 'home' }], unseen: true })
  })

  it('opens on Home and closes', () => {
    help().openHelp()
    expect(help().open).toBe(true)
    expect(currentView(help().stack)).toEqual({ kind: 'home' })
    help().closeHelp()
    expect(help().open).toBe(false)
  })

  it('opens straight to a topic with Home behind it, and Back returns', () => {
    help().openHelp({ kind: 'topic', id: 'connectors' })
    expect(currentView(help().stack)).toEqual({ kind: 'topic', id: 'connectors' })
    help().go({ kind: 'about' })
    help().back()
    expect(currentView(help().stack)).toEqual({ kind: 'topic', id: 'connectors' })
    help().back()
    help().back()
    expect(help().stack).toEqual([{ kind: 'home' }])
  })

  it('reopening starts fresh', () => {
    help().openHelp({ kind: 'about' })
    help().closeHelp()
    help().openHelp()
    expect(help().stack).toEqual([{ kind: 'home' }])
  })

  it('clears the dot and remembers the version once What’s new is opened', () => {
    help().openHelp()
    expect(help().unseen).toBe(true)
    help().go({ kind: 'whats-new' })
    expect(help().unseen).toBe(false)
    expect(stored.get(LAST_SEEN_KEY)).toBe(APP_VERSION)
  })
})
