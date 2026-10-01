import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { brotliDecompressSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { BOLD_WEIGHT, canBold, canItalic, DEFAULT_FONT_ID, FONTS, getFont, hasFace, isKnownFont, REGULAR_WEIGHT, resolveText, usedFaces } from './registry'

const ROOT = join(import.meta.dirname, '../..')
const MODULES = join(ROOT, 'node_modules')
const LICENCES = join(import.meta.dirname, 'licences')

/* ---------- Just enough of WOFF2 to read the weight axis and the italic flag ---------- */

// WOFF2 known-table tags, by index (spec section 4.1).
const KNOWN_TAGS = 'cmap head hhea hmtx maxp name OS/2 post cvt_ fpgm glyf loca prep CFF_ VORG EBDT EBLC gasp hdmx kern LTSH PCLT VDMX vhea vmtx BASE GDEF GPOS GSUB EBSC JSTF MATH CBDT CBLC COLR CPAL SVG_ sbix acnt avar bdat bloc bsln cvar fdsc feat fmtx fvar gvar hsty just lcar mort morx opbd prop trak Zapf Silf Glat Gloc Feat Sill'.split(' ').map((t) => t.replace('_', ' '))

function readTables(file: string): Map<string, Buffer> {
  const data = readFileSync(file)
  expect(data.toString('latin1', 0, 4)).toBe('wOF2')
  const numTables = data.readUInt16BE(12)
  const compressedSize = data.readUInt32BE(20)
  let pos = 48
  const base128 = () => {
    let value = 0
    for (let i = 0; i < 5; i++) {
      const byte = data[pos++]!
      value = value * 128 + (byte & 0x7f)
      if (!(byte & 0x80)) return value
    }
    throw new Error('bad UIntBase128')
  }
  const entries: { tag: string; length: number }[] = []
  for (let i = 0; i < numTables; i++) {
    const flags = data[pos++]!
    const index = flags & 0x3f
    const tag = index === 63 ? data.toString('latin1', pos, (pos += 4)) : KNOWN_TAGS[index]!
    const transform = flags >> 6
    const origLength = base128()
    // glyf and loca are transformed at version 0; other tables at any non-zero version.
    const transformed = tag === 'glyf' || tag === 'loca' ? transform === 0 : transform !== 0
    entries.push({ tag, length: transformed ? base128() : origLength })
  }
  const stream = brotliDecompressSync(data.subarray(pos, pos + compressedSize))
  const tables = new Map<string, Buffer>()
  let offset = 0
  for (const e of entries) {
    tables.set(e.tag, stream.subarray(offset, offset + e.length))
    offset += e.length
  }
  return tables
}

/** The wght axis range and whether the face is italic, read from the font itself. */
function inspect(file: string): { weight: { min: number; max: number }; italic: boolean } {
  const tables = readTables(file)
  const fvar = tables.get('fvar')
  const os2 = tables.get('OS/2')
  if (!fvar || !os2) throw new Error(`${file}: not a variable font with OS/2`)
  const axesOffset = fvar.readUInt16BE(4)
  const axisCount = fvar.readUInt16BE(8)
  const axisSize = fvar.readUInt16BE(10)
  for (let i = 0; i < axisCount; i++) {
    const at = axesOffset + i * axisSize
    if (fvar.toString('latin1', at, at + 4) !== 'wght') continue
    const fixed = (o: number) => fvar.readInt32BE(at + o) / 65536
    // fsSelection bit 0: italic.
    return { weight: { min: fixed(4), max: fixed(12) }, italic: (os2.readUInt16BE(62) & 1) === 1 }
  }
  throw new Error(`${file}: no wght axis`)
}

describe('font registry files', () => {
  it('offers the five curated fonts, Inter first and default', () => {
    expect(FONTS.map((f) => f.id)).toEqual(['inter', 'source-serif-4', 'jetbrains-mono', 'caveat', 'nunito'])
    expect(DEFAULT_FONT_ID).toBe('inter')
  })

  it.each(FONTS.map((f) => [f.id, f] as const))('%s: every face file is present and matches the file itself', (_, font) => {
    for (const f of font.faces) {
      const path = join(MODULES, f.file)
      expect(existsSync(path), f.file).toBe(true)
      const actual = inspect(path)
      expect(actual.weight, f.file).toEqual(f.weight)
      expect(actual.italic, f.file).toBe(f.style === 'italic')
      // Offered weights are inside the real range: nothing is synthesised.
      for (const w of [400, REGULAR_WEIGHT, BOLD_WEIGHT]) expect(w >= f.weight.min && w <= f.weight.max, `${f.file} ${w}`).toBe(true)
    }
  })

  it.each(FONTS.map((f) => [f.id, f] as const))('%s: the package has no face the registry leaves out', (_, font) => {
    const files = readdirSync(join(MODULES, font.package, 'files')).filter((name) => /-latin-wght-(normal|italic)\.woff2$/.test(name))
    expect(files.sort()).toEqual(font.faces.map((f) => f.file.split('/').at(-1)).sort())
  })

  it.each(FONTS.map((f) => [f.id, f] as const))('%s: its licence is in the repo and is the SIL Open Font License', (_, font) => {
    const text = readFileSync(join(LICENCES, font.licence), 'utf8')
    expect(text).toContain('SIL OPEN FONT LICENSE Version 1.1')
    // The same text the package ships (copyright line included).
    expect(text).toBe(readFileSync(join(MODULES, font.package, 'LICENSE'), 'utf8'))
    const meta = JSON.parse(readFileSync(join(MODULES, font.package, 'package.json'), 'utf8')) as { license: string }
    expect(meta.license).toBe('OFL-1.1')
  })

  it('Caveat really has no italic', () => {
    expect(canItalic(getFont('caveat'))).toBe(false)
    expect(existsSync(join(MODULES, '@fontsource-variable/caveat/files/caveat-latin-wght-italic.woff2'))).toBe(false)
  })

  it('keeps the added payload small (latin variable files only)', () => {
    const bytes = FONTS.flatMap((f) => f.faces)
      .filter((f) => f.file !== '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2')
      .reduce((sum, f) => sum + statSync(join(MODULES, f.file)).size, 0)
    expect(bytes).toBeLessThan(450 * 1024)
  })
})

describe('faces', () => {
  it('Bold and Italic are offered only where the font has them', () => {
    for (const font of FONTS) {
      expect(canBold(font), font.id).toBe(true)
      expect(canItalic(font), font.id).toBe(font.id !== 'caveat')
    }
    expect(hasFace(getFont('caveat'), 700, true)).toBe(false)
    expect(hasFace(getFont('caveat'), 900, false)).toBe(false)
  })

  it('unknown font ids fall back to the default without error', () => {
    expect(isKnownFont('some-future-font')).toBe(false)
    expect(getFont('some-future-font').id).toBe('inter')
    expect(getFont(undefined).id).toBe('inter')
    expect(resolveText({ fontFamily: 'some-future-font', fontWeight: 700 }, undefined, 15)).toMatchObject({ font: { id: 'inter' }, weight: 700 })
  })

  it('draws the nearest real face and reports what is missing, never changing the stored style', () => {
    const style = { fontFamily: 'caveat', fontStyle: 'italic', fontWeight: 700 } as const
    const copy = structuredClone(style)
    const caveat = resolveText(style, undefined, 15)
    expect(caveat).toMatchObject({ italic: false, weight: 700, unavailable: { italic: true, bold: false } })
    expect(style).toEqual(copy)
    // Switching back to a font with italic shows it again, from the same stored value.
    expect(resolveText({ ...style, fontFamily: 'nunito' }, undefined, 15)).toMatchObject({ italic: true, weight: 700, unavailable: { italic: false } })
  })

  it('uses the diagram defaults unless the label has its own values', () => {
    const defaults = { fontFamily: 'source-serif-4', fontSize: 18 }
    expect(resolveText({}, defaults, 15)).toMatchObject({ font: { id: 'source-serif-4' }, size: 18, weight: REGULAR_WEIGHT, italic: false, decoration: 'none', align: 'center' })
    expect(resolveText({ fontFamily: 'nunito', fontSize: 24, textAlign: 'left' }, defaults, 15)).toMatchObject({ font: { id: 'nunito' }, size: 24, align: 'left' })
    expect(resolveText({}, undefined, 15).size).toBe(15)
  })

  it('collects the faces in use', () => {
    const used = usedFaces([resolveText({}, undefined, 15), resolveText({ fontFamily: 'caveat', fontStyle: 'italic' }, undefined, 15), resolveText({ fontFamily: 'nunito', fontStyle: 'italic' }, undefined, 15)])
    expect([...used].map(([id, styles]) => [id, [...styles]])).toEqual([
      ['inter', ['normal']],
      ['caveat', ['normal']],
      ['nunito', ['italic']],
    ])
  })
})
