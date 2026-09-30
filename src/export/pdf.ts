/*
 * A minimal single-page PDF that shows one JPEG image full-page. Enough for
 * "export as PDF" without a PDF library: PDF can embed JPEG data as-is
 * (DCTDecode), so the file is the image plus a few hundred bytes.
 */

const encoder = new TextEncoder()

/** 1 CSS px = 0.75 pt. */
export const PX_TO_PT = 0.75

/**
 * @param jpeg        JPEG bytes (RGB)
 * @param pageWidth   page size in CSS px (the diagram's size)
 * @param pageHeight
 * @param imageWidth  JPEG size in pixels (may be larger, for sharpness)
 * @param imageHeight
 */
export function buildPdf(jpeg: Uint8Array, pageWidth: number, pageHeight: number, imageWidth: number, imageHeight: number): Uint8Array<ArrayBuffer> {
  const w = +(pageWidth * PX_TO_PT).toFixed(2)
  const h = +(pageHeight * PX_TO_PT).toFixed(2)
  const content = `q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`

  const chunks: Uint8Array[] = []
  const offsets: number[] = []
  let length = 0
  const push = (part: string | Uint8Array) => {
    const bytes = typeof part === 'string' ? encoder.encode(part) : part
    chunks.push(bytes)
    length += bytes.length
  }
  const object = (n: number, body: string | (() => void)) => {
    offsets[n] = length
    push(`${n} 0 obj\n`)
    if (typeof body === 'string') push(body)
    else body()
    push('\nendobj\n')
  }

  // Header; the second line's high bytes mark the file as binary.
  push('%PDF-1.4\n%')
  push(new Uint8Array([0xe2, 0xe3, 0xcf, 0xd3, 0x0a]))
  object(1, '<< /Type /Catalog /Pages 2 0 R >>')
  object(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>')
  object(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`)
  object(4, () => {
    push(
      `<< /Type /XObject /Subtype /Image /Width ${imageWidth} /Height ${imageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
    )
    push(jpeg)
    push('\nendstream')
  })
  object(5, `<< /Length ${encoder.encode(content).length} >>\nstream\n${content}\nendstream`)

  const xref = length
  push(`xref\n0 6\n0000000000 65535 f \n`)
  for (let n = 1; n <= 5; n++) push(`${String(offsets[n]).padStart(10, '0')} 00000 n \n`)
  push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`)

  const out = new Uint8Array(length)
  let at = 0
  for (const c of chunks) {
    out.set(c, at)
    at += c.length
  }
  return out
}
