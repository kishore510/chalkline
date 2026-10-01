import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { buildRenderModel } from '@/canvas/renderModel'
import { createRouteCache } from '@/canvas/routing'
import { fixtures } from '@/fixtures'
import { stressDiagram } from '@/fixtures/stress'
import { parseDiagram } from '@/schema/diagram'
import { themeEnv } from '@/stencils/testEnv'
import golden from './golden.json'
import { buildSvg } from './svg'

/*
 * Exports and routes must not change with refactoring or performance work.
 * golden.json holds SHA-256 hashes of output made by the code on main before
 * the 0.19 performance changes. If a change is meant to alter output, update
 * the file on purpose and say so in the changelog.
 */

const sha = (s: string) => createHash('sha256').update(s).digest('hex')
const expected = golden as Record<string, string>

describe('export output is unchanged', () => {
  it.each(Object.keys(fixtures))('%s: SVG is byte-identical in both themes', (name) => {
    const d = parseDiagram(fixtures[name])
    for (const theme of ['light', 'dark'] as const) expect(sha(buildSvg(d, themeEnv(theme)).svg), `${name} ${theme}`).toBe(expected[`svg:${name}:${theme}`])
  })

  it('a generated 300-shape diagram exports identically', () => {
    expect(sha(buildSvg(stressDiagram(300), themeEnv('light')).svg)).toBe(expected['svg:stress-300:light'])
  })

  it('every route of the 1000-shape diagram is identical', { timeout: 60_000 }, () => {
    const d = stressDiagram(1000)
    const model = buildRenderModel(d)
    const routes = createRouteCache()({ nodes: model.routingNodes, edges: model.edges })
    expect(sha(JSON.stringify([...routes]))).toBe(expected['routes:stress-1000'])
  })
})
