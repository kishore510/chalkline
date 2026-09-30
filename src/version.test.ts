import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { SCHEMA_VERSION } from '@/schema/diagram'
import { formatVersionDetails, VERSION_INFO } from './version'

describe('VERSION_INFO', () => {
  it('matches package.json', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
    expect(VERSION_INFO.version).toBe(pkg.version)
    expect(VERSION_INFO.version).toMatch(/^0\.\d+\.\d+$/)
  })

  it('has a commit (a short SHA, or "dev" without git)', () => {
    expect(VERSION_INFO.commit).toMatch(/^([0-9a-f]{4,40}|dev)$/)
  })

  it('has an ISO build date', () => {
    expect(new Date(VERSION_INFO.buildDate).toISOString()).toBe(VERSION_INFO.buildDate)
  })

  it('reports the schema version from the schema', () => {
    expect(VERSION_INFO.schemaVersion).toBe(SCHEMA_VERSION)
  })
})

describe('formatVersionDetails', () => {
  it('lists every field on its own line', () => {
    const text = formatVersionDetails({ version: '0.13.0', commit: 'dev', buildDate: '2026-09-30T10:00:00.000Z', schemaVersion: 4 }, 'TestAgent/1.0')
    expect(text.split('\n')).toEqual([
      'Chalkline 0.13.0',
      'Commit: dev',
      'Built: 2026-09-30T10:00:00.000Z',
      'Diagram schema: v4',
      'User agent: TestAgent/1.0',
    ])
  })

  it('says unknown for missing values', () => {
    const text = formatVersionDetails({ version: '0.13.0', commit: 'dev', buildDate: '', schemaVersion: 4 }, '')
    expect(text).toContain('Built: unknown')
    expect(text).toContain('User agent: unknown')
  })
})
