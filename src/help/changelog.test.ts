import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { VERSION_INFO } from '@/version'
import { compareVersions, parseChangelog, parseChangelogItem } from './changelog'
import { inlineText } from './markdown'
import { hasUnseenChanges, LAST_SEEN_KEY, markSeen, readLastSeen } from './whatsNew'

const SAMPLE = `# Changelog

All notable changes are listed here.

## [0.2.0] - 2026-09-30

### Added
- Connectors with arrowheads.
- Snap to grid,
  toggled from the View menu.

### Fixed
- Labels no longer clip.

## [0.10.0] - 2026-10-02

### Changed
- Faster export.

## [0.1.0] - 2026-09-29

### Added
- Design tokens.

[0.1.0]: https://example.com/releases/0.1.0
`

describe('parseChangelog', () => {
  it('reads several versions, newest first by version number', () => {
    const releases = parseChangelog(SAMPLE)!
    expect(releases.map((r) => r.version)).toEqual(['0.10.0', '0.2.0', '0.1.0'])
    expect(releases[1]).toEqual({
      version: '0.2.0',
      date: '2026-09-30',
      sections: [
        { title: 'Added', items: ['Connectors with arrowheads.', 'Snap to grid, toggled from the View menu.'] },
        { title: 'Fixed', items: ['Labels no longer clip.'] },
      ],
    })
  })

  it('accepts versions with missing sections, missing dates and Unreleased', () => {
    const releases = parseChangelog('# Changelog\n\n## [Unreleased]\n\n## [0.3.0]\n### Fixed\n- A fix.\n\n## [0.2.0] - 2026-01-01\n### Added\n')!
    expect(releases.map((r) => r.version)).toEqual(['Unreleased', '0.3.0', '0.2.0'])
    expect(releases[0]!.sections).toEqual([])
    expect(releases[1]!.date).toBeUndefined()
    expect(releases[2]!.sections).toEqual([])
  })

  it('returns null for malformed input so the raw text can be shown', () => {
    expect(parseChangelog('')).toBeNull()
    expect(parseChangelog('Just some notes.\nNo versions here.')).toBeNull()
    expect(parseChangelog('# Changelog\n- An item before any version\n## [0.1.0]\n### Added\n- x')).toBeNull()
    expect(parseChangelog('## [0.1.0]\n- An item outside a section')).toBeNull()
    expect(parseChangelog('## [0.1.0]\n### Added\n- x\n| a | table |')).toBeNull()
  })

  it('parses the real CHANGELOG.md, which includes the current version', () => {
    const text = readFileSync(new URL('../../CHANGELOG.md', import.meta.url), 'utf8')
    const releases = parseChangelog(text)
    expect(releases).not.toBeNull()
    expect(releases![0]!.version).toBe(VERSION_INFO.version)
    for (const r of releases!) {
      expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(r.sections.length).toBeGreaterThan(0)
      for (const s of r.sections) expect(['Added', 'Changed', 'Fixed']).toContain(s.title)
    }
  })
})

describe('compareVersions', () => {
  it('compares numerically', () => {
    expect(compareVersions('0.10.0', '0.9.1')).toBeGreaterThan(0)
    expect(compareVersions('0.9.1', '0.9.1')).toBe(0)
    expect(compareVersions('0.9', '0.9.1')).toBeLessThan(0)
    expect(compareVersions('Unreleased', '9.0.0')).toBeGreaterThan(0)
  })
})

describe('lastSeenVersion', () => {
  const memory = () => {
    const data = new Map<string, string>()
    return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), data }
  }

  it('shows the dot until the current version has been seen', () => {
    const store = memory()
    expect(hasUnseenChanges(readLastSeen(store), '0.13.0')).toBe(true)
    markSeen('0.13.0', store)
    expect(store.data.get(LAST_SEEN_KEY)).toBe('0.13.0')
    expect(hasUnseenChanges(readLastSeen(store), '0.13.0')).toBe(false)
    expect(hasUnseenChanges(readLastSeen(store), '0.14.0')).toBe(true)
  })

  it('copes with storage that is missing or throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }
    expect(readLastSeen(broken)).toBeNull()
    expect(() => markSeen('0.13.0', broken)).not.toThrow()
    expect(readLastSeen(undefined)).toBeNull()
  })
})

describe('parseChangelogItem', () => {
  it('reads **bold** and `code`', () => {
    expect(parseChangelogItem('**Refine with AI**: choose **AI**, then press `Ctrl Z`.')).toEqual([
      { type: 'strong', children: [{ type: 'text', text: 'Refine with AI' }] },
      { type: 'text', text: ': choose ' },
      { type: 'strong', children: [{ type: 'text', text: 'AI' }] },
      { type: 'text', text: ', then press ' },
      { type: 'code', text: 'Ctrl Z' },
      { type: 'text', text: '.' },
    ])
  })

  it('never makes links, images or HTML', () => {
    const nodes = parseChangelogItem('See [docs](https://example.com) ![logo](https://example.com/x.png) <img src="x"><b>hi</b>')
    expect(JSON.stringify(nodes)).not.toMatch(/"link"/)
    expect(inlineText(nodes)).toBe('See docs (https://example.com) logo hi')
  })

  it('leaves no stray ** or ` in the real CHANGELOG', () => {
    for (const release of parseChangelog(readFileSync(new URL('../../CHANGELOG.md', import.meta.url), 'utf8'))!) {
      for (const section of release.sections) {
        for (const item of section.items) expect(inlineText(parseChangelogItem(item))).not.toMatch(/\*\*|`/)
      }
    }
  })
})
