import type { TextAlign, TextDecoration, TextDefaults } from '@/schema/diagram'

/*
 * The fonts offered for labels, like the shape registry. Pure data and rules;
 * the browser side (fontFaces.ts) loads the files. Each face below is checked
 * against the actual woff2 file (weight range from its variation axis, italic
 * from its style flags) and each licence file by src/fonts/registry.test.ts.
 *
 * All are variable fonts, latin subset only, self-hosted from Fontsource
 * packages; one file per style covers every weight we offer.
 */

export interface FontFaceFile {
  style: 'normal' | 'italic'
  /** The variable weight axis, as in the file. */
  weight: { min: number; max: number }
  /** The woff2 file, relative to node_modules. */
  file: string
}

export interface FontDefinition {
  id: string
  label: string
  /** What it's like, for the picker. */
  kind: string
  /** CSS family name the faces are registered under. */
  family: string
  /** Used for characters outside the latin subset, or before the font loads. */
  fallback: string
  faces: readonly FontFaceFile[]
  /** npm package the files come from. */
  package: string
  /** Licence text, in src/fonts/licences/. */
  licence: string
  /** Shown under the picker when this font is chosen. */
  note?: string
}

const pkg = (name: string) => `@fontsource-variable/${name}`
const face = (name: string, style: 'normal' | 'italic', min: number, max: number): FontFaceFile => ({
  style,
  weight: { min, max },
  file: `${pkg(name)}/files/${name}-latin-wght-${style}.woff2`,
})

const SANS = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif"

export const FONTS: readonly FontDefinition[] = [
  {
    id: 'inter',
    label: 'Inter',
    kind: 'Sans serif (default)',
    family: 'Inter Variable',
    fallback: SANS,
    faces: [face('inter', 'normal', 100, 900), face('inter', 'italic', 100, 900)],
    package: pkg('inter'),
    licence: 'inter.txt',
  },
  {
    id: 'source-serif-4',
    label: 'Source Serif 4',
    kind: 'Serif',
    family: 'Source Serif 4 Variable',
    fallback: "ui-serif, Georgia, 'Times New Roman', serif",
    faces: [face('source-serif-4', 'normal', 200, 900), face('source-serif-4', 'italic', 200, 900)],
    package: pkg('source-serif-4'),
    licence: 'source-serif-4.txt',
  },
  {
    id: 'jetbrains-mono',
    label: 'JetBrains Mono',
    kind: 'Monospace',
    family: 'JetBrains Mono Variable',
    fallback: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
    faces: [face('jetbrains-mono', 'normal', 100, 800), face('jetbrains-mono', 'italic', 100, 800)],
    package: pkg('jetbrains-mono'),
    licence: 'jetbrains-mono.txt',
  },
  {
    id: 'caveat',
    label: 'Caveat',
    kind: 'Handwritten',
    family: 'Caveat Variable',
    fallback: `'Comic Sans MS', ${SANS}`,
    // No italic in this family.
    faces: [face('caveat', 'normal', 400, 700)],
    package: pkg('caveat'),
    licence: 'caveat.txt',
    note: 'Handwriting gets hard to read below about 14 px.',
  },
  {
    id: 'nunito',
    label: 'Nunito',
    kind: 'Rounded sans serif',
    family: 'Nunito Variable',
    fallback: SANS,
    faces: [face('nunito', 'normal', 200, 1000), face('nunito', 'italic', 200, 1000)],
    package: pkg('nunito'),
    licence: 'nunito.txt',
  },
]

export const DEFAULT_FONT_ID = 'inter'
const byId = new Map(FONTS.map((f) => [f.id, f]))

export const isKnownFont = (id: string | undefined): boolean => id !== undefined && byId.has(id)

/** The font for an id; unknown or missing ids get the default font. */
export function getFont(id: string | undefined): FontDefinition {
  return (id !== undefined && byId.get(id)) || byId.get(DEFAULT_FONT_ID)!
}

/** CSS font-family value: the font, then its fallbacks. */
export const cssFamily = (font: FontDefinition) => `'${font.family}', ${font.fallback}`

/** Labels that aren't bold use this weight (the app's label weight); Bold is 700. */
export const REGULAR_WEIGHT = 500
export const BOLD_WEIGHT = 700

function faceFor(font: FontDefinition, italic: boolean): FontFaceFile | undefined {
  return font.faces.find((f) => f.style === (italic ? 'italic' : 'normal'))
}

/** True if the font really has this weight in this style (no faux bold or italic). */
export function hasFace(font: FontDefinition, weight: number, italic: boolean): boolean {
  const f = faceFor(font, italic)
  return Boolean(f && weight >= f.weight.min && weight <= f.weight.max)
}

export const canBold = (font: FontDefinition) => hasFace(font, BOLD_WEIGHT, false)
export const canItalic = (font: FontDefinition) => font.faces.some((f) => f.style === 'italic')

/** The style fields that decide how a label's text looks. */
export interface TextStyleFields {
  fontFamily?: string
  fontSize?: number
  fontWeight?: 400 | 700
  fontStyle?: 'normal' | 'italic'
  textDecoration?: TextDecoration
  textAlign?: TextAlign
}

/** What to draw: real faces only. The stored values are never changed by this. */
export interface ResolvedText {
  font: FontDefinition
  size: number
  weight: number
  italic: boolean
  decoration: TextDecoration
  align: TextAlign
  /** Stored values the font can't show (drawn with the nearest face instead). */
  unavailable: { bold: boolean; italic: boolean }
}

/**
 * Resolves a label's style against the diagram defaults and the font's real
 * faces. If the font lacks a face the style asks for (e.g. italic in Caveat),
 * the nearest face is drawn and the stored value is kept, so switching back
 * to a font that has it shows it again.
 */
export function resolveText(style: TextStyleFields, defaults: TextDefaults | undefined, baseSize: number): ResolvedText {
  const font = getFont(style.fontFamily ?? defaults?.fontFamily)
  const wantItalic = style.fontStyle === 'italic'
  const italic = wantItalic && canItalic(font)
  const wanted = style.fontWeight ?? REGULAR_WEIGHT
  const range = faceFor(font, italic)?.weight ?? { min: wanted, max: wanted }
  const weight = Math.min(range.max, Math.max(range.min, wanted))
  return {
    font,
    size: style.fontSize ?? defaults?.fontSize ?? baseSize,
    weight,
    italic,
    decoration: style.textDecoration ?? 'none',
    align: style.textAlign ?? 'center',
    unavailable: { bold: style.fontWeight === BOLD_WEIGHT && weight !== BOLD_WEIGHT, italic: wantItalic && !italic },
  }
}

/** Group and lane titles are semibold; family and size follow the group's style, then the diagram defaults. */
export const TITLE_WEIGHT = 600
export function titleText(style: TextStyleFields, defaults: TextDefaults | undefined, baseSize: number): ResolvedText {
  return { ...resolveText(style, defaults, baseSize), weight: style.fontWeight ?? TITLE_WEIGHT }
}

/** Connector labels are one line: they take the diagram's font but keep their own (smaller) default size. */
export function edgeLabelText(style: TextStyleFields, defaults: TextDefaults | undefined, baseSize: number): ResolvedText {
  return { ...resolveText(style, defaults && { fontFamily: defaults.fontFamily }, baseSize), align: 'center' }
}

/** Inline CSS for a resolved label (canvas). font-synthesis is off everywhere, so nothing is faked. */
export function textCss(text: ResolvedText) {
  return {
    fontFamily: cssFamily(text.font),
    fontWeight: text.weight,
    fontStyle: text.italic ? 'italic' : 'normal',
    textDecorationLine: text.decoration === 'none' ? undefined : text.decoration,
    textAlign: text.align,
    fontSynthesis: 'none',
  } as const
}

/** The fonts and styles a diagram's labels use, so exports embed only those. */
export function usedFaces(texts: Iterable<ResolvedText>): Map<string, Set<'normal' | 'italic'>> {
  const used = new Map<string, Set<'normal' | 'italic'>>()
  for (const t of texts) {
    let styles = used.get(t.font.id)
    if (!styles) used.set(t.font.id, (styles = new Set()))
    styles.add(t.italic ? 'italic' : 'normal')
  }
  return used
}
