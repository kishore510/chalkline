import { useStore } from '@xyflow/react'
import { memo, useMemo } from 'react'
import { readToken } from '@/lib/cssVar'
import type { Measure } from './guides'
import { useGuideStore, type GuideOverlay as Overlay } from './guideSession'

type Transform = [number, number, number]

/** Marker ends and label for a distance: the gap between shapes, or a matched size. */
function MeasureMark({ m, t, sizes }: { m: Measure; t: Transform; sizes: Sizes }) {
  const [tx, ty, zoom] = t
  const horizontal = m.axis === 'x'
  // Along the axis in screen px; `across` is the other coordinate.
  const a = (horizontal ? tx : ty) + m.from * zoom
  const b = (horizontal ? tx : ty) + m.to * zoom
  const across = (horizontal ? ty : tx) + m.at * zoom - (m.kind === 'size' ? sizes.offset : 0)
  const tick = sizes.tick / 2
  const point = (along: number, off: number) => (horizontal ? { x: along, y: across + off } : { x: across + off, y: along })
  const line = (p: { x: number; y: number }, q: { x: number; y: number }, key: string) => <line key={key} x1={p.x} y1={p.y} x2={q.x} y2={q.y} />
  const label = point((a + b) / 2, 0)
  return (
    <g>
      {line(point(a, 0), point(b, 0), 'span')}
      {line(point(a, -tick), point(a, tick), 'start')}
      {line(point(b, -tick), point(b, tick), 'end')}
      <text
        x={label.x}
        y={label.y}
        dy={horizontal ? -sizes.halo : 0}
        dx={horizontal ? 0 : -sizes.halo}
        textAnchor={horizontal ? 'middle' : 'end'}
        dominantBaseline={horizontal ? 'auto' : 'middle'}
        className="text-xs font-medium"
        style={{ paintOrder: 'stroke', stroke: 'var(--cl-canvas)', strokeWidth: sizes.halo, fill: 'var(--cl-guide)' }}
      >
        {Math.round(m.value)}
      </text>
    </g>
  )
}

interface Sizes {
  width: number
  tick: number
  offset: number
  halo: number
}

/** Draws in screen space: lines stay 1px and labels readable at any zoom. */
const Guides = memo(function Guides({ overlay, sizes }: { overlay: Overlay; sizes: Sizes }) {
  const t = useStore((s) => s.transform)
  const [tx, ty, zoom] = t
  return (
    <svg aria-hidden="true" className="pointer-events-none absolute inset-0 z-10 size-full overflow-visible" shapeRendering="crispEdges">
      <g fill="none" stroke="var(--cl-guide-subtle)" strokeWidth={sizes.width}>
        {overlay.aligned.map((a) => (
          <rect key={a.id} x={tx + a.box.x * zoom} y={ty + a.box.y * zoom} width={a.box.width * zoom} height={a.box.height * zoom} />
        ))}
      </g>
      <g stroke="var(--cl-guide)" strokeWidth={sizes.width}>
        {overlay.lines.map((l) =>
          l.axis === 'x' ? (
            <line key={`x${l.at}`} x1={tx + l.at * zoom} x2={tx + l.at * zoom} y1={ty + l.from * zoom} y2={ty + l.to * zoom} />
          ) : (
            <line key={`y${l.at}`} y1={ty + l.at * zoom} y2={ty + l.at * zoom} x1={tx + l.from * zoom} x2={tx + l.to * zoom} />
          ),
        )}
        {overlay.measures.map((m, i) => (
          <MeasureMark key={i} m={m} t={t} sizes={sizes} />
        ))}
      </g>
    </svg>
  )
})

/**
 * Smart guides while a drag or resize is in progress; gone the moment it ends.
 * Never takes pointer events. Nothing is subscribed to the viewport until
 * there is something to draw, so panning and zooming cost nothing here.
 */
export function GuideOverlay() {
  const overlay = useGuideStore((s) => s.overlay)
  const sizes = useMemo(
    () => ({
      width: readToken('--cl-guide-width', 1),
      tick: readToken('--cl-guide-tick', 6),
      offset: readToken('--cl-guide-offset', 10),
      halo: readToken('--cl-guide-halo', 3),
    }),
    [],
  )
  if (!overlay) return null
  return <Guides overlay={overlay} sizes={sizes} />
}
