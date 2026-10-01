import { createEmptyDiagram, type Diagram } from '@/schema/diagram'
import { buildSvg, type ExportEnv } from '@/export/svg'
import type { StencilContent } from './format'

/*
 * Small SVG previews for stencils and templates. Colours are left as token
 * references (var(--cl-token)), so one cached preview serves both themes; the
 * palette resolves them to the current theme's values when it shows one.
 * Labels are left out: at thumbnail size they are unreadable noise; the
 * shapes and structure are what tell items apart.
 */

/** Sizes the preview is drawn at (it scales to fit its box). */
export interface ThumbnailSizes {
  fontSize: number
  lineHeight: number
  nodePadding: number
  nodeStrokeWidth: number
  edgeWidth: number
  freeLabelMax: number
  edgeLabelFontSize: number
}

export function thumbnailEnv(sizes: ThumbnailSizes): ExportEnv {
  return {
    ...sizes,
    colour: (token) => `var(--cl-${token})`,
    measure: (text, size) => text.length * size * 0.55,
  }
}

const unlabelled = <T extends { label: string }>(item: T): T => ({ ...item, label: '' })

/** A standalone SVG string that scales to its container. */
export function diagramThumbnail(diagram: Diagram, env: ExportEnv): string {
  const bare: Diagram = {
    ...diagram,
    // Previews show everything, whatever the saved layer visibility.
    layers: diagram.layers.map((l) => ({ ...l, visible: true })),
    nodes: diagram.nodes.map(unlabelled),
    edges: diagram.edges.map(unlabelled),
    groups: diagram.groups.map((g) => ({ ...unlabelled(g), collapsed: false })),
  }
  const { svg, width, height } = buildSvg(bare, env, { padding: 8, background: false })
  return svg
    .replace(`width="${width}" height="${height}"`, 'width="100%" height="100%" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false"')
    .replace(/<title>[^<]*<\/title>/, '')
}

export function stencilThumbnail(content: StencilContent, env: ExportEnv): string {
  return diagramThumbnail({ ...createEmptyDiagram(), ...content }, env)
}

/** Swaps var(--cl-token) for real colours (`lookup` returns '' for unknown tokens, which are left alone). */
export function resolveTokenColours(svg: string, lookup: (token: string) => string): string {
  return svg.replace(/var\(--cl-([a-z0-9-]+)\)/g, (match, token: string) => lookup(token) || match)
}
