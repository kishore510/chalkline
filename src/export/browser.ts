import interLatinUrl from '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url'
import { readToken } from '@/lib/cssVar'
import type { Diagram } from '@/schema/diagram'
import { fileNameFor } from '@/persistence/serialize'
import { buildPdf } from './pdf'
import { buildSvg, type ExportEnv } from './svg'

/*
 * Browser side of export: reads the current theme's colours and sizes from
 * the design tokens, measures text with the real font, and turns the SVG into
 * PNG or PDF via a canvas. Not unit-tested (needs a real browser); the pure
 * parts it relies on (svg.ts, pdf.ts, text.ts) are.
 */

export type ExportFormat = 'svg' | 'png' | 'pdf'

const FONT_FAMILY = "'Inter Variable', Inter, ui-sans-serif, system-ui, sans-serif"
// Largest canvas area we ask for; iOS Safari refuses canvases much above ~16.7M pixels.
const MAX_CANVAS_PIXELS = 16_000_000
// Output resolution for PNG/PDF (2 = retina-sharp).
const RASTER_SCALE = 2
const JPEG_QUALITY = 0.92

function rootStyle() {
  return getComputedStyle(document.documentElement)
}

function remToPx(value: string, fallback: number): number {
  const rem = value.trim().match(/^([\d.]+)rem$/)
  if (!rem) return fallback
  return Number(rem[1]) * parseFloat(rootStyle().fontSize || '16')
}

async function createEnv(fontCss?: string): Promise<ExportEnv> {
  const style = rootStyle()
  const fontSize = remToPx(style.getPropertyValue('--text-node'), 15)
  // Make sure the font is ready before measuring, or widths come from a fallback font.
  await document.fonts?.load(`500 ${fontSize}px 'Inter Variable'`).catch(() => undefined)
  const context = document.createElement('canvas').getContext('2d')
  const measure = (text: string, size: number) => {
    if (!context) return text.length * size * 0.55
    context.font = `500 ${size}px ${FONT_FAMILY}`
    return context.measureText(text).width
  }
  return {
    colour: (token) => style.getPropertyValue(`--cl-${token}`).trim(),
    measure,
    fontFamily: FONT_FAMILY,
    fontCss,
    fontSize,
    lineHeight: parseFloat(style.getPropertyValue('--text-node--line-height')) || 1.35,
    nodePadding: readToken('--cl-node-padding', 8),
    nodeStrokeWidth: readToken('--cl-node-stroke-width', 1.5),
    edgeWidth: readToken('--cl-edge-width', 1.5),
    freeLabelMax: readToken('--cl-label-free-max', 200),
    edgeLabelFontSize: remToPx(style.getPropertyValue('--text-xs'), 12),
  }
}

/** @font-face for Inter with the font inlined, so a rasterised SVG (which can't load files) uses it. */
async function embeddedFontCss(): Promise<string> {
  try {
    const bytes = new Uint8Array(await (await fetch(interLatinUrl)).arrayBuffer())
    let binary = ''
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    return `@font-face{font-family:'Inter Variable';font-weight:100 900;src:url(data:font/woff2;base64,${btoa(binary)}) format('woff2')}`
  } catch {
    return ''
  }
}

async function rasterise(svg: string, width: number, height: number): Promise<HTMLCanvasElement> {
  const scale = Math.min(RASTER_SCALE, Math.sqrt(MAX_CANVAS_PIXELS / (width * height)))
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(width * scale))
    canvas.height = Math.max(1, Math.round(height * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas is not available')
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    return canvas
  } finally {
    URL.revokeObjectURL(url)
  }
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not encode image'))), type, quality))
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.append(link)
  link.click()
  link.remove()
  // Give the browser time to start the download before releasing the data.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** Exports the diagram in the current theme and downloads it. */
export async function exportDiagram(diagram: Diagram, format: ExportFormat): Promise<void> {
  const title = diagram.meta.title
  if (format === 'svg') {
    const { svg } = buildSvg(diagram, await createEnv())
    downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), fileNameFor(title, 'svg'))
    return
  }
  const { svg, width, height } = buildSvg(diagram, await createEnv(await embeddedFontCss()))
  const canvas = await rasterise(svg, width, height)
  if (format === 'png') {
    downloadBlob(await toBlob(canvas, 'image/png'), fileNameFor(title, 'png'))
    return
  }
  const jpeg = new Uint8Array(await (await toBlob(canvas, 'image/jpeg', JPEG_QUALITY)).arrayBuffer())
  const pdf = buildPdf(jpeg, width, height, canvas.width, canvas.height)
  downloadBlob(new Blob([pdf], { type: 'application/pdf' }), fileNameFor(title, 'pdf'))
}
