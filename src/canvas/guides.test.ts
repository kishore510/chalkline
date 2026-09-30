import { describe, expect, it } from 'vitest'
import { computeGuides, computeResizeGuides, type GuideTarget } from './guides'

const box = (x: number, y: number, width = 100, height = 60) => ({ x, y, width, height })
const target = (id: string, x: number, y: number, width = 100, height = 60): GuideTarget => ({ id, box: box(x, y, width, height) })
const noSpacing = { zoom: 1, equalSpacing: false }

describe('computeGuides: alignment pairs', () => {
  // The candidate's left, centre and right are 500, 550 and 600. The moving box is 100 wide.
  const cand = [target('a', 500, 400)]
  const cases: [name: string, movingX: number, snappedX: number][] = [
    ['left to left', 503, 500],
    ['left to centre', 548, 550],
    ['left to right', 604, 600],
    ['centre to left', 452, 450],
    ['centre to centre', 497, 500],
    ['centre to right', 546, 550],
    ['right to left', 402, 400],
    ['right to centre', 453, 450],
    ['right to right', 495, 500],
  ]
  it.each(cases)('x: %s', (_, movingX, snappedX) => {
    const r = computeGuides(box(movingX, 0), cand, noSpacing)
    expect(movingX + r.dx).toBe(snappedX)
    expect(r.snapX).toBe('guide')
    expect(r.lines.some((l) => l.axis === 'x')).toBe(true)
    expect(r.aligned.map((t) => t.id)).toEqual(['a'])
  })

  // The candidate's top, middle and bottom are 400, 430 and 460. The moving box is 60 tall.
  const vcases: [name: string, movingY: number, snappedY: number][] = [
    ['top to top', 404, 400],
    ['top to middle', 428, 430],
    ['top to bottom', 463, 460],
    ['middle to top', 372, 370],
    ['middle to middle', 397, 400],
    ['middle to bottom', 425, 430],
    ['bottom to top', 343, 340],
    ['bottom to middle', 366, 370],
    ['bottom to bottom', 405, 400],
  ]
  it.each(vcases)('y: %s', (_, movingY, snappedY) => {
    const r = computeGuides(box(0, movingY), [target('a', 1000, 400)], noSpacing)
    expect(movingY + r.dy).toBe(snappedY)
    expect(r.snapY).toBe('guide')
    expect(r.lines.some((l) => l.axis === 'y')).toBe(true)
  })

  it('draws a line from the moving box to the furthest aligned candidate', () => {
    const r = computeGuides(box(502, 0), [target('a', 500, 400), target('b', 500, 900)], noSpacing)
    const left = r.lines.find((l) => l.axis === 'x' && l.at === 500)!
    expect(left).toMatchObject({ from: 0, to: 960, kind: 'edge' })
  })

  it('marks centre-to-centre lines as centre', () => {
    const r = computeGuides(box(498, 0), [target('a', 500, 400)], noSpacing)
    expect(r.lines.find((l) => l.at === 550)?.kind).toBe('centre')
  })
})

describe('computeGuides: choosing a match', () => {
  it('picks the nearest match per axis', () => {
    // Left 505 is 5 from 500 (a's left) and 2 from 503 (b's left).
    const r = computeGuides(box(505, 0), [target('a', 500, 300), target('b', 503, 600)], noSpacing)
    expect(r.dx).toBe(-2)
    expect(r.aligned.map((t) => t.id)).toContain('b')
    expect(r.aligned.map((t) => t.id)).not.toContain('a')
  })

  it('snaps each axis independently', () => {
    const r = computeGuides(box(503, 204), [target('a', 500, 700), target('b', 900, 200)], noSpacing)
    expect(r).toMatchObject({ dx: -3, dy: -4, snapX: 'guide', snapY: 'guide' })
  })

  it('measures the threshold in screen pixels', () => {
    // 10 canvas units away: 10 screen px at zoom 1 (too far), 5 at zoom 0.5 (close enough).
    expect(computeGuides(box(510, 0), [target('a', 500, 400)], { ...noSpacing, zoom: 1 }).snapX).toBeNull()
    expect(computeGuides(box(510, 0), [target('a', 500, 400)], { ...noSpacing, zoom: 0.5 }).dx).toBe(-10)
    // 4 canvas units: 8 screen px at zoom 2 (too far).
    expect(computeGuides(box(504, 0), [target('a', 500, 400)], { ...noSpacing, zoom: 2 }).snapX).toBeNull()
  })

  it('honours a custom threshold', () => {
    expect(computeGuides(box(510, 0), [target('a', 500, 400)], { ...noSpacing, threshold: 12 }).dx).toBe(-10)
  })

  it('reports every candidate sharing the chosen line', () => {
    const r = computeGuides(box(502, 0), [target('a', 500, 200), target('b', 500, 500), target('c', 450, 800, 150)], noSpacing)
    // a and b (same width) line up on all three lines; c only by its right edge (600).
    expect(r.aligned.map((t) => t.id).sort()).toEqual(['a', 'b', 'c'])
    expect(r.lines.filter((l) => l.axis === 'x').map((l) => l.at).sort()).toEqual([500, 550, 600])
  })

  it('returns no snap and nothing to draw when nothing is close', () => {
    const r = computeGuides(box(0, 0), [target('a', 500, 400)], noSpacing)
    expect(r).toEqual({ dx: 0, dy: 0, snapX: null, snapY: null, lines: [], measures: [], aligned: [] })
  })
})

describe('computeGuides: centre targets', () => {
  const diagram = { kind: 'diagram' as const, box: box(0, 0, 1000, 800) }

  it('snaps the centre to the diagram centre lines', () => {
    const r = computeGuides(box(447, 367), [], { ...noSpacing, centres: [diagram] })
    expect(r).toMatchObject({ dx: 3, dy: 3 })
    expect(r.lines.map((l) => l.kind)).toEqual(['diagram', 'diagram'])
  })

  it('only matches centre to centre', () => {
    // Left edge 498 is near the centre line (500), but centres of a centre target don't take edges.
    expect(computeGuides(box(498, 0), [], { ...noSpacing, centres: [diagram] }).snapX).toBeNull()
  })

  it('offers a container centre', () => {
    const container = { kind: 'container' as const, id: 'g', box: box(100, 100, 400, 300) }
    const r = computeGuides(box(248, 218), [], { ...noSpacing, centres: [container] })
    expect(r).toMatchObject({ dx: 2, dy: 2 })
    expect(r.lines.every((l) => l.kind === 'container')).toBe(true)
  })
})

describe('computeGuides: equal spacing', () => {
  const opts = { zoom: 1 }

  it('matches the gap to a neighbour with an existing gap in the row', () => {
    // a [0,100], b [140,240]: gap 40. Moving right of b at 283 (gap 43) snaps to 280.
    const r = computeGuides(box(283, 5, 100, 50), [target('a', 0, 0), target('b', 140, 0)], opts)
    expect(r.dx).toBe(-3)
    expect(r.snapX).toBe('guide')
    const gaps = r.measures.filter((m) => m.kind === 'gap' && m.axis === 'x')
    expect(gaps.map((g) => [g.from, g.to, g.value])).toEqual([
      [240, 280, 40],
      [100, 140, 40],
    ])
  })

  it('works with unequal sizes: gaps are edge to edge', () => {
    // a is 50 wide, b is 200 wide: gap between them 30. Moving (80 wide) left of a.
    const cand = [target('a', 300, 0, 50, 60), target('b', 380, 20, 200, 30)]
    const r = computeGuides(box(168, 10, 80, 40), cand, opts)
    // The gap to a is 52, far from 30: no snap.
    expect(r.snapX).toBeNull()
    const near = computeGuides(box(192, 10, 80, 40), cand, opts)
    expect(192 + near.dx + 80).toBe(270)
    expect(near.measures.map((m) => m.value)).toEqual([30, 30])
  })

  it('centres between two neighbours', () => {
    // a ends at 100, b starts at 300; a 100-wide box centred between them sits at 150.
    const r = computeGuides(box(146, 200, 100, 40), [target('a', 0, 190), target('b', 300, 190)], opts)
    expect(r.dx).toBe(4)
    expect(r.measures.map((m) => [m.from, m.to])).toEqual([
      [100, 150],
      [250, 300],
    ])
  })

  it('works in columns too', () => {
    const r = computeGuides(box(5, 283, 50, 100), [target('a', 0, 0, 60, 100), target('b', 0, 140, 60, 100)], opts)
    expect(r.dy).toBe(-3)
    expect(r.measures.every((m) => m.axis === 'y')).toBe(true)
  })

  it('ignores boxes outside the row', () => {
    const r = computeGuides(box(283, 500, 100, 50), [target('a', 0, 0), target('b', 140, 0)], opts)
    expect(r.measures).toEqual([])
  })

  it('can be switched off', () => {
    const r = computeGuides(box(283, 5, 100, 50), [target('a', 0, 0), target('b', 140, 0)], { ...opts, equalSpacing: false })
    expect(r.measures).toEqual([])
    expect(r.snapX).toBeNull()
  })

  it('prefers alignment over spacing when equally close', () => {
    // Alignment to c's left (286) and spacing (280) are both 3 away.
    const r = computeGuides(box(283, 5, 100, 50), [target('a', 0, 0), target('b', 140, 0), target('c', 286, 400)], opts)
    expect(r.dx).toBe(3)
  })
})

describe('computeGuides: grid', () => {
  it('a guide within the threshold beats the grid', () => {
    const r = computeGuides(box(503, 0), [target('a', 507, 400)], { ...noSpacing, grid: 20 })
    expect(r).toMatchObject({ dx: 4, snapX: 'guide' })
  })

  it('otherwise the grid snaps as before', () => {
    const r = computeGuides(box(513, 27), [target('a', 700, 400)], { ...noSpacing, grid: 20 })
    expect(r).toMatchObject({ dx: 7, dy: -7, snapX: 'grid', snapY: 'grid', lines: [] })
  })

  it('snaps the grid anchor, not the box corner', () => {
    const r = computeGuides(box(513, 27), [], { ...noSpacing, grid: 20, gridAnchor: { x: 604, y: 27 } })
    expect(r.dx).toBe(-4)
  })

  it('guides off (Alt held) falls back to the grid', () => {
    const r = computeGuides(box(503, 0), [target('a', 507, 400)], { ...noSpacing, grid: 20, guides: false })
    expect(r).toMatchObject({ dx: -3, snapX: 'grid', lines: [], aligned: [] })
  })

  it('guides off and no grid: no snap', () => {
    expect(computeGuides(box(503, 0), [target('a', 507, 400)], { ...noSpacing, guides: false })).toMatchObject({ dx: 0, snapX: null })
  })
})

describe('computeResizeGuides', () => {
  const right = { left: false, right: true, top: false, bottom: false }
  const left = { left: true, right: false, top: false, bottom: false }
  const bottom = { left: false, right: false, top: false, bottom: true }

  it('snaps the moving right edge to a target edge', () => {
    const r = computeResizeGuides(box(0, 0, 197, 60), right, [target('a', 200, 300, 50)], { zoom: 1 })
    expect(r.box).toEqual(box(0, 0, 200, 60))
    expect(r.lines).toMatchObject([{ axis: 'x', at: 200 }])
  })

  it('snaps the moving left edge and keeps the right edge fixed', () => {
    const r = computeResizeGuides(box(103, 0, 97, 60), left, [target('a', 100, 300, 300)], { zoom: 1 })
    expect(r.box).toEqual(box(100, 0, 100, 60))
  })

  it('matches another shape’s width and shows size markers on both', () => {
    const r = computeResizeGuides(box(0, 0, 146, 60), right, [target('a', 400, 300, 150)], { zoom: 1 })
    expect(r.box.width).toBe(150)
    expect(r.measures).toEqual([
      { kind: 'size', axis: 'x', from: 0, to: 150, at: 0, value: 150 },
      { kind: 'size', axis: 'x', from: 400, to: 550, at: 300, value: 150 },
    ])
    expect(r.aligned.map((t) => t.id)).toEqual(['a'])
  })

  it('matches height from the bottom handle', () => {
    const r = computeResizeGuides(box(0, 0, 100, 76), bottom, [target('a', 400, 300, 50, 80)], { zoom: 1 })
    expect(r.box.height).toBe(80)
    expect(r.snapY).toBe('guide')
    expect(r.measures.every((m) => m.axis === 'y' && m.value === 80)).toBe(true)
  })

  it('never goes below the minimum size', () => {
    // The right edge (45) is 5 from a's left edge (40), but that would make it 40 wide.
    const r = computeResizeGuides(box(0, 0, 45, 60), right, [target('a', 40, 300, 200)], { zoom: 1, minSize: { width: 44, height: 20 } })
    expect(r.box.width).toBe(45)
    expect(r.snapX).toBeNull()
  })

  it('falls back to the grid for the moving edge', () => {
    const r = computeResizeGuides(box(10, 0, 127, 60), right, [], { zoom: 1, grid: 20 })
    expect(r.box).toEqual(box(10, 0, 130, 60))
    expect(r.snapX).toBe('grid')
  })

  it('a guide beats the grid, and guides off uses the grid', () => {
    // The right edge (137) is 4 from a's left edge (133) and 3 from the grid (140).
    const cand = [target('a', 133, 300, 100)]
    expect(computeResizeGuides(box(10, 0, 127, 60), right, cand, { zoom: 1, grid: 20 }).box.width).toBe(123)
    expect(computeResizeGuides(box(10, 0, 127, 60), right, cand, { zoom: 1, grid: 20, guides: false }).box.width).toBe(130)
  })

  it('leaves axes that are not being resized alone', () => {
    const r = computeResizeGuides(box(0, 3, 197, 60), right, [target('a', 200, 0, 50)], { zoom: 1, grid: 20 })
    expect(r.box.y).toBe(3)
    expect(r.box.height).toBe(60)
  })
})
