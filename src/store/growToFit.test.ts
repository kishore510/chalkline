import { beforeEach, describe, expect, it } from 'vitest'
import { fixtures } from '@/fixtures'
import { DiagramSchema } from '@/schema/diagram'
import { useDiagramStore } from './diagramStore'

const store = () => useDiagramStore.getState()
const size = (id: string) => store().diagram.nodes.find((n) => n.id === id)!.size

beforeEach(() => store().load(fixtures['all-shapes']))

describe('growNodeToFit', () => {
  it('grows a node that is too short, rounding up', () => {
    store().growNodeToFit('n_rect', 120.2)
    expect(size('n_rect')).toEqual({ width: 160, height: 121 })
    expect(DiagramSchema.safeParse(store().diagram).success).toBe(true)
  })

  it('never shrinks a node and ignores bad input', () => {
    const before = store().diagram
    store().growNodeToFit('n_rect', 40)
    store().growNodeToFit('n_rect', Number.NaN)
    store().growNodeToFit('ghost', 500)
    expect(store().diagram).toBe(before)
  })
})
