import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { exportFixtures, fixtures, legacyFixtures, stencilFixtures } from '@/fixtures'
import { stressDiagram } from '@/fixtures/stress'
import { createEmptyDiagram, DiagramSchema, parseDiagram, type Diagram, type DiagramInput } from '@/schema/diagram'
import { SHAPE_IDS } from '@/shapes/registry'
import { parseStencil } from '@/stencils/format'
import { parseTemplate } from '@/stencils/templates'
import { themeColours } from '@/stencils/testEnv'
import { escapeMermaidLabel, MERMAID_SHAPES, toMermaid } from './mermaid'

/* ---------- Helpers ---------- */

type NodeIn = DiagramInput['nodes'][number]
type EdgeIn = DiagramInput['edges'][number]
type GroupIn = NonNullable<DiagramInput['groups']>[number]

let seq = 0
const node = (over: Partial<NodeIn> = {}): NodeIn => ({
  id: `node ${++seq}`,
  type: 'rectangle',
  position: { x: 0, y: 0 },
  size: { width: 160, height: 80 },
  label: 'A',
  ...over,
})
const edge = (source: string, target: string, over: Partial<EdgeIn> = {}): EdgeIn => ({ id: `edge ${++seq}`, source, target, ...over })
const group = (over: Partial<GroupIn> & { id: string }): GroupIn => ({ position: { x: 0, y: 0 }, size: { width: 400, height: 300 }, ...over })

function diagram(parts: Partial<Pick<DiagramInput, 'nodes' | 'edges' | 'groups' | 'layers'>>): Diagram {
  return DiagramSchema.parse({ ...createEmptyDiagram(), ...parts })
}

const body = (text: string) => text.split('\n').slice(1).join('\n')
const LIGHT = themeColours('light')

/* ---------- Shapes ---------- */

describe('shapes', () => {
  const golden: [string, string][] = [
    ['rectangle', 'n1["A"]'],
    ['rounded', 'n1("A")'],
    ['ellipse', 'n1(["A"])'],
    ['database', 'n1[("A")]'],
    ['circle', 'n1(("A"))'],
    ['diamond', 'n1{"A"}'],
    ['hexagon', 'n1{{"A"}}'],
    ['parallelogram', 'n1[/"A"/]'],
    // Mapped to the closest classic shape.
    ['square', 'n1["A"]'],
    ['queue', 'n1(["A"])'],
    ['microservice', 'n1("A")'],
    ['api-gateway', 'n1{{"A"}}'],
    ['vector-db', 'n1[("A")]'],
    ['firewall', 'n1["A"]'],
  ]
  it.each(golden)('%s', (type, line) => {
    const { text, warnings } = toMermaid(diagram({ nodes: [node({ type })] }), { direction: 'TD' })
    expect(text).toBe(`flowchart TD\n    ${line}\n`)
    expect(warnings.some((w) => w.includes('no Mermaid equivalent'))).toBe(false)
  })

  it('the lookup only names real registry shapes', () => {
    for (const id of Object.keys(MERMAID_SHAPES)) expect(SHAPE_IDS).toContain(id)
  })

  it('an unmapped shape falls back to a rectangle with one warning per type, not per shape', () => {
    const d = diagram({ nodes: [node({ type: 'actor' }), node({ type: 'actor' }), node({ type: 'cloud' }), node({ type: 'from-the-future' })] })
    const { text, warnings } = toMermaid(d, { direction: 'TD' })
    expect(body(text)).toBe('    n1["A"]\n    n2["A"]\n    n3["A"]\n    n4["A"]\n')
    const fallbacks = warnings.filter((w) => w.includes('no Mermaid equivalent'))
    expect(fallbacks).toHaveLength(3)
    expect(fallbacks.find((w) => w.includes('Actor'))).toMatch(/2 shapes/)
    expect(fallbacks.find((w) => w.includes('from-the-future'))).toBeDefined()
  })
})

/* ---------- Edges ---------- */

describe('connector styles', () => {
  const golden: [string, EdgeIn['style'], string][] = [
    ['arrow (default)', {}, 'n1 --> n2'],
    ['no arrow', { endArrow: 'none' }, 'n1 --- n2'],
    ['dashed', { dashed: true }, 'n1 -.-> n2'],
    ['dashed, no arrow', { dashed: true, endArrow: 'none' }, 'n1 -.- n2'],
    ['thick', { width: 3 }, 'n1 ==> n2'],
    ['heavy', { width: 5 }, 'n1 ==> n2'],
    ['medium is not thick', { width: 2 }, 'n1 --> n2'],
    ['thick, no arrow', { width: 3, endArrow: 'none' }, 'n1 === n2'],
    ['bidirectional', { startArrow: 'arrow' }, 'n1 <--> n2'],
    ['bidirectional dashed', { startArrow: 'arrow', dashed: true }, 'n1 <-.-> n2'],
    ['bidirectional thick', { startArrow: 'closed', endArrow: 'closed', width: 3 }, 'n1 <==> n2'],
    ['start arrow only is turned round', { startArrow: 'arrow', endArrow: 'none' }, 'n2 --> n1'],
  ]
  it.each(golden)('%s', (_, style, line) => {
    const a = node({ position: { x: 0, y: 0 } })
    const b = node({ position: { x: 0, y: 200 } })
    const { text } = toMermaid(diagram({ nodes: [a, b], edges: [edge(a.id, b.id, { style })] }), { direction: 'TD' })
    expect(text.trimEnd().split('\n').at(-1)).toBe(`    ${line}`)
  })

  it('labels are quoted and escaped', () => {
    const a = node()
    const b = node()
    const { text } = toMermaid(diagram({ nodes: [a, b], edges: [edge(a.id, b.id, { label: 'a|b "c"' })] }), { direction: 'TD' })
    expect(text).toContain('    n1 -->|"a#124;b #quot;c#quot;"| n2\n')
  })

  it('warns about what has no equivalent: thick dashed lines and filled arrowheads', () => {
    const [a, b, c] = [node(), node(), node()]
    const d = diagram({ nodes: [a, b, c], edges: [edge(a.id, b.id, { style: { dashed: true, width: 5 } }), edge(b.id, c.id, { style: { endArrow: 'closed' } })] })
    const { text, warnings } = toMermaid(d, { direction: 'TD' })
    expect(text).toContain('n1 -.-> n2')
    expect(warnings.join('\n')).toMatch(/thick and dashed/i)
    expect(warnings.join('\n')).toMatch(/filled arrowheads/i)
  })
})

/* ---------- Escaping ---------- */

describe('escaping', () => {
  const cases: [string, string, string][] = [
    ['double quotes', 'Say "hi"', 'Say #quot;hi#quot;'],
    ['brackets', 'a[b]{c}', 'a#91;b#93;#123;c#125;'],
    ['parentheses', 'f(x)', 'f#40;x#41;'],
    ['pipe', 'a|b', 'a#124;b'],
    ['comment marker', '%% not a comment', '#37;#37; not a comment'],
    ['single percent is fine', '50%', '50%'],
    ['backticks', '`code`', '#96;code#96;'],
    ['newlines', 'one\ntwo\r\nthree', 'one<br/>two<br/>three'],
    ['angle brackets and ampersand', '<b>&amp;', '#lt;b#gt;#38;amp;'],
    ['hash (so no accidental entity)', '#quot;', '#35;quot;'],
    ['keyword end', 'end', 'end'],
    ['emoji and non-Latin text', 'Café 🚀 数据 مرحبا', 'Café 🚀 数据 مرحبا'],
    ['tabs and control characters', 'a\tb\u0007c', 'a bc'],
    ['empty', '', ' '],
    ['whitespace only', '  \n ', ' '],
  ]
  it.each(cases)('%s', (_, input, output) => expect(escapeMermaidLabel(input)).toBe(output))

  it('never leaves a raw quote, newline or bracket inside any label', () => {
    const nasty = ['"]]{{((', '|`%%\n\n', 'x"]; click n1 call alert()']
    const d = diagram({ nodes: nasty.map((label) => node({ label })) })
    for (const line of body(toMermaid(d, { direction: 'TD' }).text).trimEnd().split('\n')) {
      expect(line).toMatch(/^ {4}n\d+\["[^"[\](){}|`\n]*"\]$/)
    }
  })

  it.each(['end', 'graph', 'subgraph', 'click', 'flowchart', 'style', 'class', 'classDef', 'direction'])('keyword "%s" stays a quoted label', (word) => {
    const { text } = toMermaid(diagram({ nodes: [node({ label: word })] }), { direction: 'TD' })
    expect(text).toBe(`flowchart TD\n    n1["${word}"]\n`)
  })

  it('keeps very long labels on one line', () => {
    const label = 'word '.repeat(2000).trim()
    const { text } = toMermaid(diagram({ nodes: [node({ label })] }), { direction: 'TD' })
    expect(text).toBe(`flowchart TD\n    n1["${label}"]\n`)
  })

  it('empty labels become a single space, for shapes, groups and connectors', () => {
    const a = node({ label: '', groupId: 'g' })
    const b = node({ label: '' })
    const d = diagram({ nodes: [a, b], edges: [edge(a.id, b.id)], groups: [group({ id: 'g', label: '' })] })
    expect(body(toMermaid(d, { direction: 'TD' }).text)).toBe(['    n2[" "]', '    subgraph g1[" "]', '        n1[" "]', '    end', '    n1 --> n2', ''].join('\n'))
  })
})

/* ---------- IDs ---------- */

describe('ids', () => {
  it('raw ids with spaces, hyphens or symbols never reach the output', () => {
    const ids = ['my node', 'a-b-c', 'x"]; end', '%%id', 'ünï', 'node:1|2']
    const nodes = ids.map((id, i) => node({ id, label: `L${i}` }))
    const d = diagram({ nodes, edges: [edge(ids[0]!, ids[1]!, { id: 'edge "x"' })], groups: [group({ id: 'grp id-1' })] })
    d.nodes[2]!.groupId = 'grp id-1'
    const { text } = toMermaid(d, { direction: 'TD', includeNotes: true })
    for (const id of [...ids, 'grp id-1', 'edge "x"']) expect(text).not.toContain(id)
    expect(text).toMatch(/subgraph g1\["/)
  })
})

/* ---------- Groups and swimlanes ---------- */

describe('groups and swimlanes', () => {
  it('nests subgraphs as in the diagram', () => {
    const d = diagram({
      groups: [group({ id: 'outer', label: 'Outer' }), group({ id: 'inner', label: 'Inner', parentId: 'outer' })],
      nodes: [node({ label: 'Top' }), node({ label: 'In outer', groupId: 'outer' }), node({ label: 'In inner', groupId: 'inner' })],
    })
    expect(body(toMermaid(d, { direction: 'TD' }).text)).toBe(
      [
        '    n1["Top"]',
        '    subgraph g1["Outer"]',
        '        n2["In outer"]',
        '        subgraph g2["Inner"]',
        '            n3["In inner"]',
        '        end',
        '    end',
        '',
      ].join('\n'),
    )
  })

  it('exports swimlane children inside their lane, lanes in visual order', () => {
    const d = parseDiagram(fixtures['swimlane-pool'])
    const lines = toMermaid(d, { direction: 'TD' }).text.split('\n')
    const at = (s: string) => lines.findIndex((l) => l.includes(s))
    expect(lines[at('Payments platform')]).toBe('    subgraph g1["Payments platform"]')
    expect(lines[at('"Channels"')]).toBe('        subgraph g2["Channels"]')
    expect(lines[at('"Mobile app"')]).toBe('            n1["Mobile app"]')
    expect(at('"Channels"')).toBeLessThan(at('"Integration"'))
    expect(at('"Integration"')).toBeLessThan(at('"Data"'))
    expect(lines[at('"Ledger"')]).toBe('            n6[("Ledger")]')
  })

  it('keeps an empty group as an empty subgraph', () => {
    const d = diagram({ groups: [group({ id: 'g', label: 'Empty' })] })
    expect(body(toMermaid(d, { direction: 'TD' }).text)).toBe('    subgraph g1["Empty"]\n    end\n')
  })

  it('a collapsed group is one shape; connectors are moved to it, loops dropped and duplicates removed', () => {
    const d = diagram({
      groups: [group({ id: 'c', label: 'Collapsed', collapsed: true }), group({ id: 'deep', label: 'Deep', parentId: 'c' })],
      nodes: [node({ id: 'out', label: 'Out' }), node({ id: 'in1', groupId: 'c' }), node({ id: 'in2', groupId: 'deep' })],
      edges: [edge('out', 'in1'), edge('out', 'in2'), edge('in1', 'in2'), edge('in2', 'out', { label: 'back' })],
    })
    const { text, warnings } = toMermaid(d, { direction: 'TD' })
    expect(body(text)).toBe(['    n1["Out"]', '    g1["Collapsed"]', '    n1 --> g1', '    g1 -->|"back"| n1', ''].join('\n'))
    expect(warnings.join('\n')).toMatch(/1 collapsed group/)
  })

  it('a collapsed group inside an expanded one sits in its subgraph', () => {
    const d = diagram({
      groups: [group({ id: 'p', label: 'Parent' }), group({ id: 'c', label: 'Folded', parentId: 'p', collapsed: true })],
      nodes: [node({ label: 'Hidden', groupId: 'c' })],
    })
    expect(body(toMermaid(d, { direction: 'TD' }).text)).toBe('    subgraph g1["Parent"]\n        g2["Folded"]\n    end\n')
  })
})

/* ---------- Layers ---------- */

describe('layers', () => {
  it('leaves out hidden layers and the connectors touching them, and counts them', () => {
    const d = diagram({
      layers: [
        { id: 'default', name: 'Base' },
        { id: 'secret', name: 'Hidden', visible: false },
        { id: 'top', name: 'Top', locked: true },
      ],
      nodes: [node({ id: 'a', label: 'A' }), node({ id: 'b', label: 'B', layerId: 'top', locked: true }), node({ id: 'h', label: 'Hidden', layerId: 'secret' })],
      edges: [edge('a', 'b'), edge('a', 'h'), edge('h', 'b'), edge('a', 'b', { layerId: 'secret', label: 'on hidden layer' })],
    })
    const { text, warnings } = toMermaid(d, { direction: 'TD' })
    expect(body(text)).toBe('    n1["A"]\n    n2["B"]\n    n1 --> n2\n')
    expect(warnings).toContain('Hidden layers are left out: 1 shape and 3 connectors.')
    expect(warnings.join('\n')).toMatch(/lock/i)
  })

  it('drops connectors whose shape is missing, with a count', () => {
    const d = diagram({ nodes: [node({ id: 'a' })] })
    // Not valid against the schema, but a caller could still pass it in.
    d.edges.push({ id: 'x', source: 'a', target: 'gone', label: '', notes: '', style: {} }, { id: 'y', source: 'nope', target: 'a', label: '', notes: '', style: {} })
    const { warnings } = toMermaid(d, { direction: 'TD' })
    expect(warnings).toContain('2 connectors are left out because a shape they join is missing.')
  })
})

/* ---------- Direction ---------- */

describe('direction', () => {
  const wide = diagram({ nodes: [node({ position: { x: 0, y: 0 } }), node({ position: { x: 800, y: 0 } })] })
  const tall = diagram({ nodes: [node({ position: { x: 0, y: 0 } }), node({ position: { x: 0, y: 800 } })] })
  it('auto picks LR for a wide diagram and TD for a tall one', () => {
    expect(toMermaid(wide).text.startsWith('flowchart LR\n')).toBe(true)
    expect(toMermaid(tall, { direction: 'auto' }).text.startsWith('flowchart TD\n')).toBe(true)
    expect(toMermaid(diagram({})).text).toBe('flowchart TD\n')
  })
  it('an explicit direction wins', () => {
    expect(toMermaid(wide, { direction: 'TD' }).text.startsWith('flowchart TD\n')).toBe(true)
    expect(toMermaid(tall, { direction: 'LR' }).text.startsWith('flowchart LR\n')).toBe(true)
  })
  it('auto ignores shapes on hidden layers', () => {
    const d = diagram({
      layers: [{ id: 'default' }, { id: 'off', visible: false }],
      nodes: [node({ position: { x: 0, y: 0 } }), node({ position: { x: 0, y: 800 } }), node({ position: { x: 5000, y: 0 }, layerId: 'off' })],
    })
    expect(toMermaid(d).text.startsWith('flowchart TD\n')).toBe(true)
  })
})

/* ---------- Colours ---------- */

describe('colours', () => {
  it('resolves presets to light-theme hex and emits one classDef per fill/stroke pair', () => {
    const d = diagram({
      nodes: [
        node({ style: { fill: 'token:swatch-blue-soft', stroke: 'token:swatch-blue' } }),
        node(),
        node({ style: { fill: 'token:swatch-blue-soft', stroke: 'token:swatch-blue' } }),
        node({ style: { fill: '#ABCDEF' } }),
        node({ style: { textColour: 'token:swatch-red', fontSize: 20 } }),
      ],
    })
    const lines = toMermaid(d, { direction: 'TD' }).text.trimEnd().split('\n')
    expect(lines.slice(-4)).toEqual([
      `    classDef c1 fill:${LIGHT['swatch-blue-soft']},stroke:${LIGHT['swatch-blue']}`,
      '    classDef c2 fill:#abcdef',
      '    class n1,n3 c1',
      '    class n4 c2',
    ])
  })

  it('emits no classDef for default-styled shapes', () => {
    const { text } = toMermaid(parseDiagram(fixtures['process-flow']), { direction: 'TD' })
    expect(text).not.toContain('classDef')
    expect(text).not.toMatch(/^ {4}class /m)
  })

  it('the light swatch values are real hex colours', () => {
    expect(LIGHT['swatch-blue-soft']).toMatch(/^#[0-9a-f]{6}$/)
  })
})

/* ---------- Notes ---------- */

describe('notes', () => {
  const a = node({ label: 'A', notes: 'First line\nsecond "line" %% here' })
  const b = node({ label: 'B' })
  const d = diagram({ nodes: [a, b], edges: [edge(a.id, b.id, { notes: 'Edge note' })] })

  it('are left out by default, with a warning', () => {
    const { text, warnings } = toMermaid(d, { direction: 'TD' })
    expect(text).not.toContain('note')
    expect(warnings.join('\n')).toMatch(/notes/i)
  })

  it('are single-line comments when included', () => {
    const { text, warnings } = toMermaid(d, { direction: 'TD', includeNotes: true })
    expect(text).toContain('    %% note for n1: First line<br/>second #quot;line#quot; #37;#37; here\n')
    expect(text).toContain('    %% note for n1 --> n2: Edge note\n')
    expect(warnings.join('\n')).not.toMatch(/notes are left out/i)
  })
})

/* ---------- Determinism, fixtures and scale ---------- */

describe('whole diagrams', () => {
  it('is byte-identical twice', () => {
    const d = parseDiagram(exportFixtures['mermaid-sample'])
    expect(toMermaid(d, { includeNotes: true })).toEqual(toMermaid(structuredClone(d), { includeNotes: true }))
  })

  it('does not change the diagram', () => {
    const d = parseDiagram(exportFixtures['mermaid-sample'])
    const before = JSON.stringify(d)
    toMermaid(d, { includeNotes: true })
    expect(JSON.stringify(d)).toBe(before)
  })

  it('the sample fixture matches its golden file', () => {
    const golden = readFileSync(join(import.meta.dirname, '..', 'fixtures', 'mermaid-sample.mmd'), 'utf8')
    expect(toMermaid(parseDiagram(exportFixtures['mermaid-sample'])).text).toBe(golden)
  })

  const saved: [string, () => Diagram][] = [
    ...Object.entries(fixtures).map(([name, raw]): [string, () => Diagram] => [name, () => parseDiagram(raw)]),
    ...Object.entries(legacyFixtures).map(([name, raw]): [string, () => Diagram] => [name, () => parseDiagram(raw)]),
    ...Object.entries(exportFixtures).map(([name, raw]): [string, () => Diagram] => [name, () => parseDiagram(raw)]),
    ['stencil current', () => ({ ...createEmptyDiagram(), ...parseStencil(stencilFixtures.current).content })],
    ['stencil v1', () => ({ ...createEmptyDiagram(), ...parseStencil(stencilFixtures.v1).content })],
    ['stencil unknown shape', () => ({ ...createEmptyDiagram(), ...parseStencil(stencilFixtures.unknownShape).content })],
    ['template', () => parseTemplate(stencilFixtures.template).diagram],
  ]
  it.each(saved)('%s exports without throwing, with or without notes', (_, load) => {
    const d = load()
    for (const includeNotes of [false, true]) {
      const { text } = toMermaid(d, { includeNotes })
      expect(text).toMatch(/^flowchart (TD|LR)\n/)
      for (const n of d.nodes) expect(text).not.toContain(`${n.id}[`)
    }
  })

  it.each([300, 1000])('stress-%i exports quickly', (count) => {
    const d = stressDiagram(count)
    const start = performance.now()
    const { text } = toMermaid(d, { includeNotes: true })
    expect(performance.now() - start).toBeLessThan(2000)
    expect(text.split('\n').length).toBeGreaterThan(count / 2)
  })
})
