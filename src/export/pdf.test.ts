import { describe, expect, it } from 'vitest'
import { buildPdf } from './pdf'

const fakeJpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9])
const latin1 = (bytes: Uint8Array) => Array.from(bytes, (b) => String.fromCharCode(b)).join('')

describe('buildPdf', () => {
  const pdf = buildPdf(fakeJpeg, 800, 600, 1600, 1200)
  const text = latin1(pdf)

  it('is a PDF with the page sized in points', () => {
    expect(text.startsWith('%PDF-1.4\n')).toBe(true)
    expect(text).toContain('/MediaBox [0 0 600 450]')
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true)
  })

  it('embeds the JPEG bytes unchanged with the right length', () => {
    expect(text).toContain('/Filter /DCTDecode /Length 9')
    expect(text).toContain('/Width 1600 /Height 1200')
    expect(text).toContain(latin1(fakeJpeg))
  })

  it('has an xref table whose offsets point at each object', () => {
    const xrefAt = Number(text.match(/startxref\n(\d+)/)![1])
    expect(text.slice(xrefAt, xrefAt + 4)).toBe('xref')
    const offsets = [...text.slice(xrefAt).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]))
    expect(offsets).toHaveLength(5)
    offsets.forEach((offset, i) => expect(text.slice(offset, offset + 8)).toBe(`${i + 1} 0 obj\n`))
  })
})
