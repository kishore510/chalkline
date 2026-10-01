import { faceBase64 } from '@/fonts/fontFaces'
import { FONTS, type FontFaceFile } from '@/fonts/registry'
import { readToken } from '@/lib/cssVar'
import type { Diagram } from '@/schema/diagram'
import { fileNameFor } from '@/persistence/serialize'
import { buildPdf } from './pdf'
import { buildSvg, type ExportEnv } from './svg'

/*
 * Browser side of export: reads the current theme's colours and sizes from
 * the design tokens, measures text with the real fonts, and turns the SVG into
 * PNG or PDF via a canvas. Not unit-tested (needs a real browser); the pure
 * parts it relies on (svg.ts, pdf.ts, text.ts) are.
 *
 * Fonts: a first pass finds the faces the labels use; those are loaded (so
 * measuring uses them) and embedded in the SVG, which is what PNG and PDF are
 * drawn from too. Only used faces are embedded.
 */

export type ExportFormat = 'svg' | 'png' | 'pdf'

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

function createEnv(fontData?: ReadonlyMap<string, string>): ExportEnv {
  const style = rootStyle()
  const fontSize = remToPx(style.getPropertyValue('--text-node'), 15)
  const context = document.createElement('canvas').getContext('2d')
  const measure: ExportEnv['measure'] = (text, size, face) => {
    if (!context) return text.length * size * 0.55
    context.font = `${face?.italic ? 'italic ' : ''}${face?.weight ?? 500} ${size}px ${face?.family ?? 'sans-serif'}`
    return context.measureText(text).width
  }
  return {
    colour: (token) => style.getPropertyValue(`--cl-${token}`).trim(),
    measure,
    fontData,
    fontSize,
    lineHeight: parseFloat(style.getPropertyValue('--text-node--line-height')) || 1.35,
    nodePadding: readToken('--cl-node-padding', 8),
    nodeStrokeWidth: readToken('--cl-node-stroke-width', 1.5),
    edgeWidth: readToken('--cl-edge-width', 1.5),
    freeLabelMax: readToken('--cl-label-free-max', 200),
    edgeLabelFontSize: remToPx(style.getPropertyValue('--text-xs'), 12),
  }
}

/**
 * Loads the faces (so text is measured with them) and reads their data for
 * embedding. A face that can't be read is left out of the map.
 */
async function prepareFaces(faces: FontFaceFile[]): Promise<Map<string, string>> {
  const data = new Map<string, string>()
  await Promise.all(
    faces.map(async (face) => {
      const font = FONTS.find((f) => f.faces.includes(face))
      if (font) await document.fonts?.load(`${face.style === 'italic' ? 'italic ' : ''}${Math.max(face.weight.min, 400)} 16px '${font.family}'`).catch(() => undefined)
      const base64 = await faceBase64(face)
      if (base64) data.set(face.file, base64)
    }),
  )
  return data
}

/** Builds the SVG with the used faces loaded and embedded (pass 1 finds them, pass 2 draws). */
async function svgWithFonts(diagram: Diagram, includeHidden: boolean) {
  const { faces } = buildSvg(diagram, createEnv(), { includeHidden })
  return buildSvg(diagram, createEnv(await prepareFaces(faces)), { includeHidden })
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

/** Exports the diagram in the current theme and downloads it. Hidden layers are left out unless `includeHidden`. */
export async function exportDiagram(diagram: Diagram, format: ExportFormat, { includeHidden = false }: { includeHidden?: boolean } = {}): Promise<void> {
  const title = diagram.meta.title
  // The same fonts in every format: SVG carries them, and PNG and PDF are drawn from that SVG.
  const { svg, width, height } = await svgWithFonts(diagram, includeHidden)
  if (format === 'svg') {
    downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), fileNameFor(title, 'svg'))
    return
  }
  const canvas = await rasterise(svg, width, height)
  if (format === 'png') {
    downloadBlob(await toBlob(canvas, 'image/png'), fileNameFor(title, 'png'))
    return
  }
  const jpeg = new Uint8Array(await (await toBlob(canvas, 'image/jpeg', JPEG_QUALITY)).arrayBuffer())
  const pdf = buildPdf(jpeg, width, height, canvas.width, canvas.height)
  downloadBlob(new Blob([pdf], { type: 'application/pdf' }), fileNameFor(title, 'pdf'))
}
