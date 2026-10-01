import type { Glyph } from './types'

/*
 * Glyphs drawn from Lucide icon artwork. lucide-react doesn't export its path
 * data, so the paths are copied here and icons.test.ts checks the copy still
 * matches the installed package. Drawn through the pen like any other glyph,
 * they give the palette icon, the canvas mark and exports one source.
 */

/** Path data (each `<path>`'s `d`) of the Lucide icons used as glyphs, keyed by Lucide icon name. */
export const LUCIDE = {
  plug: ['M12 22v-5', 'M15 8V2', 'M17 8a1 1 0 0 1 1 1v4a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1z', 'M9 8V2'],
  'server-cog': [
    'm10.852 14.772-.383.923',
    'M13.148 14.772a3 3 0 1 0-2.296-5.544l-.383-.923',
    'm13.148 9.228.383-.923',
    'm13.53 15.696-.382-.924a3 3 0 1 1-2.296-5.544',
    'm14.772 10.852.923-.383',
    'm14.772 13.148.923.383',
    'M4.5 10H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-.5',
    'M4.5 14H4a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2h-.5',
    'M6 18h.01',
    'M6 6h.01',
    'm9.228 10.852-.923-.383',
    'm9.228 13.148-.923.383',
  ],
  wrench: [
    'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z',
  ],
} as const satisfies Record<string, readonly string[]>

/** Lucide draws on a 24-unit grid with a 2-unit margin, so its artwork spans 2 to 22. */
const MARGIN = 2
const SPAN = 20

/** How many numbers each path command takes. */
const ARITY: Record<string, number> = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 }

const TOKEN = /[a-zA-Z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g

/**
 * A glyph from Lucide path data. Every command is made absolute (H and V
 * become L), and points and arc radii go through the pen, so the artwork
 * draws at any size and place.
 */
export function lucideGlyph(paths: readonly string[]): Glyph {
  return (pen) => {
    const pt = (x: number, y: number) => pen.p((x - MARGIN) / SPAN, (y - MARGIN) / SPAN)
    return paths.map((d) => {
      const tokens = d.match(TOKEN) ?? []
      let out = ''
      let [x, y, startX, startY] = [0, 0, 0, 0]
      let cmd = ''
      for (let i = 0; i < tokens.length; ) {
        if (/[a-zA-Z]/.test(tokens[i]!)) cmd = tokens[i++]!
        const lower = cmd.toLowerCase()
        const arity = ARITY[lower]
        if (arity === undefined) throw new Error(`Unsupported path command "${cmd}"`)
        const args = tokens.slice(i, i + arity).map(Number)
        i += arity
        // Relative commands are offsets from the current point.
        const [ox, oy] = cmd === lower ? [x, y] : [0, 0]
        switch (lower) {
          case 'z':
            out += 'Z'
            ;[x, y] = [startX, startY]
            break
          case 'm':
            ;[x, y] = [ox + args[0]!, oy + args[1]!]
            ;[startX, startY] = [x, y]
            out += `M${pt(x, y)}`
            // Further pairs after a move are lines.
            cmd = cmd === lower ? 'l' : 'L'
            break
          case 'h':
            x = ox + args[0]!
            out += `L${pt(x, y)}`
            break
          case 'v':
            y = oy + args[0]!
            out += `L${pt(x, y)}`
            break
          case 'a': {
            const [rx, ry, rotation, large, sweep, ex, ey] = args as [number, number, number, number, number, number, number]
            ;[x, y] = [ox + ex, oy + ey]
            out += `A${pen.l(rx / SPAN)} ${pen.l(ry / SPAN)} ${rotation} ${large} ${sweep} ${pt(x, y)}`
            break
          }
          default: {
            // l, t, c, s, q: every pair is a point.
            const points: string[] = []
            for (let k = 0; k < args.length; k += 2) points.push(pt(ox + args[k]!, oy + args[k + 1]!))
            ;[x, y] = [ox + args[arity - 2]!, oy + args[arity - 1]!]
            out += lower.toUpperCase() + points.join(' ')
          }
        }
      }
      return out
    })
  }
}
