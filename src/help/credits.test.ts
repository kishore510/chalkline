import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CREDITS, creditFor, HIGHLIGHTS } from './credits'

describe('credits', () => {
  it('list every runtime dependency with a licence', () => {
    const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'))
    for (const name of Object.keys(pkg.dependencies)) expect(creditFor(name)?.license, name).toBeTruthy()
    expect(CREDITS.length).toBeGreaterThanOrEqual(Object.keys(pkg.dependencies).length)
  })

  it('name only packages that are bundled', () => {
    for (const h of HIGHLIGHTS) expect(creditFor(h.name), h.name).toBeDefined()
  })

  it('include React Flow, Inter and Lucide with their licences', () => {
    expect(creditFor('@xyflow/react')?.license).toBe('MIT')
    expect(creditFor('@fontsource-variable/inter')?.license).toBe('OFL-1.1')
    expect(creditFor('lucide-react')?.license).toBe('ISC')
  })
})
