import { describe, expect, it } from 'vitest'
import { collectCredits, readCommit } from './buildInfo'

describe('readCommit', () => {
  it('returns the short SHA from git', () => {
    expect(readCommit(() => '60f9bc1\n')).toBe('60f9bc1')
  })

  it('falls back to "dev" when git is unavailable', () => {
    expect(
      readCommit(() => {
        throw new Error('not a git repository')
      }),
    ).toBe('dev')
  })

  it('falls back to "dev" for unexpected output', () => {
    expect(readCommit(() => '')).toBe('dev')
    expect(readCommit(() => 'fatal: bad revision')).toBe('dev')
  })
})

describe('collectCredits', () => {
  const packages: Record<string, object> = {
    alpha: { version: '1.0.0', license: 'MIT', homepage: 'https://alpha.example', dependencies: { shared: '^1' } },
    beta: { version: '2.0.0', license: 'ISC', repository: { url: 'git+https://github.com/example/beta.git' }, dependencies: { shared: '^1' } },
    shared: { version: '0.1.0', license: { type: 'odd' } },
  }
  const read = (name: string) => packages[name]

  it('lists runtime dependencies and their dependencies once each, sorted', () => {
    const credits = collectCredits({ dependencies: { beta: '^2', alpha: '^1', missing: '^1' } }, read)
    expect(credits.map((c) => c.name)).toEqual(['alpha', 'beta', 'shared'])
  })

  it('reads licences and project links', () => {
    const [alpha, beta, shared] = collectCredits({ dependencies: { alpha: '^1', beta: '^2' } }, read)
    expect(alpha).toEqual({ name: 'alpha', version: '1.0.0', license: 'MIT', url: 'https://alpha.example' })
    expect(beta?.url).toBe('https://github.com/example/beta')
    expect(shared?.license).toBe('See package')
    expect(shared?.url).toBeUndefined()
  })
})
