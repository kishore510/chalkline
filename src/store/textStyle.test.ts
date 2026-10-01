import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fixtures } from '@/fixtures'
import { DiagramSchema } from '@/schema/diagram'
import { extractStencilContent, placeStencil } from '@/stencils/fragment'
import { parseStencil, serializeStencil, STENCIL_KIND } from '@/stencils/format'
import { SCHEMA_VERSION } from '@/schema/diagram'
import { useDiagramStore } from './diagramStore'

/* text-styles: n_serif (Source Serif 4, bold italic 18), n_mono (JetBrains Mono, left), n_chalk (Caveat, italic, underline), e_styled. */

const store = () => useDiagramStore.getState()
const node = (id: string) => store().diagram.nodes.find((n) => n.id === id)!
const valid = () => expect(DiagramSchema.safeParse(store().diagram).success).toBe(true)

beforeEach(() => {
  vi.useRealTimers()
  store().load(fixtures['text-styles'], { undoable: false })
})

describe('text styling edits', () => {
  it('apply to every selected item in one undo step, and undo restores them', () => {
    store().updateNodeStyles(['n_default', 'n_mono'], { fontFamily: 'caveat', textDecoration: 'underline' })
    expect(node('n_default').style).toMatchObject({ fontFamily: 'caveat', textDecoration: 'underline' })
    expect(node('n_mono').style).toMatchObject({ fontFamily: 'caveat', textDecoration: 'underline', textAlign: 'left' })
    expect(store().past).toHaveLength(1)
    valid()
    store().undo()
    expect(node('n_mono').style.fontFamily).toBe('jetbrains-mono')
  })

  it('switching to a font without italic keeps the stored italic, so switching back restores it', () => {
    store().updateNodeStyles(['n_serif'], { fontFamily: 'caveat' })
    expect(node('n_serif').style.fontStyle).toBe('italic')
    store().updateNodeStyles(['n_serif'], { fontFamily: 'nunito' })
    expect(node('n_serif').style).toMatchObject({ fontFamily: 'nunito', fontStyle: 'italic', fontWeight: 700 })
  })

  it('works on connectors too, and refuses invalid values without changing anything', () => {
    store().updateEdgeStyles(['e_plain'], { fontWeight: 700, fontFamily: 'nunito' })
    expect(store().diagram.edges.find((e) => e.id === 'e_plain')!.style).toMatchObject({ fontWeight: 700, fontFamily: 'nunito', fontStyle: 'italic' })
    const before = store().diagram
    store().updateNodeStyles(['n_default'], { fontWeight: 600 as 700 })
    expect(store().diagram).toBe(before)
    valid()
  })

  it('diagram text defaults are an undoable edit; clearing both removes them', () => {
    store().setTextDefaults({ fontFamily: 'caveat' })
    expect(store().diagram.textDefaults).toEqual({ fontFamily: 'caveat', fontSize: 16 })
    store().setTextDefaults({ fontFamily: undefined, fontSize: undefined })
    expect(store().diagram.textDefaults).toBeUndefined()
    valid()
    store().undo()
    store().undo()
    expect(store().diagram.textDefaults).toEqual({ fontFamily: 'nunito', fontSize: 16 })
    // No change, no undo step.
    const steps = store().past.length
    store().setTextDefaults({ fontFamily: 'nunito' })
    expect(store().past).toHaveLength(steps)
  })
})

describe('text styles travel with copies', () => {
  it('copy and paste, and duplicate, keep every text field', () => {
    store().setSelection(['n_serif', 'n_chalk', 'e_styled', 'n_default'])
    store().copySelection()
    const pasted = store().paste()
    const copies = store().diagram.nodes.filter((n) => pasted.includes(n.id))
    expect(copies.map((n) => n.style)).toEqual(expect.arrayContaining([node('n_serif').style, node('n_chalk').style]))
    const edge = store().diagram.edges.find((e) => pasted.includes(e.id))
    expect(edge?.style).toEqual(store().diagram.edges.find((e) => e.id === 'e_styled')!.style)
    store().setSelection(['n_mono'])
    const [dup] = store().duplicateSelection()
    expect(node(dup!).style).toEqual(node('n_mono').style)
    valid()
  })

  it('stencils keep every text field through save, file and insert', () => {
    const extracted = extractStencilContent(store().diagram, ['n_serif', 'n_chalk', 'n_struck'])
    if (!extracted.ok) throw new Error('not extracted')
    const file = serializeStencil({ kind: STENCIL_KIND, schemaVersion: SCHEMA_VERSION, id: 's1', name: 'Styled', category: 'Test', tags: [], created: '2026-10-01T09:00:00.000Z', content: extracted.content })
    const stencil = parseStencil(JSON.parse(file))
    const { diagram, ids } = placeStencil(store().diagram, stencil.content, { x: 900, y: 900 }, 'default')
    const placed = diagram.nodes.filter((n) => ids.includes(n.id)).map((n) => n.style)
    expect(placed).toEqual(expect.arrayContaining([node('n_serif').style, node('n_chalk').style, node('n_struck').style]))
    expect(DiagramSchema.safeParse(diagram).success).toBe(true)
  })
})
