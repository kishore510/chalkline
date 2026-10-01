import caveatNormal from '@fontsource-variable/caveat/files/caveat-latin-wght-normal.woff2?url'
import interItalic from '@fontsource-variable/inter/files/inter-latin-wght-italic.woff2?url'
import interNormal from '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url'
import jetbrainsItalic from '@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-italic.woff2?url'
import jetbrainsNormal from '@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2?url'
import nunitoItalic from '@fontsource-variable/nunito/files/nunito-latin-wght-italic.woff2?url'
import nunitoNormal from '@fontsource-variable/nunito/files/nunito-latin-wght-normal.woff2?url'
import serifItalic from '@fontsource-variable/source-serif-4/files/source-serif-4-latin-wght-italic.woff2?url'
import serifNormal from '@fontsource-variable/source-serif-4/files/source-serif-4-latin-wght-normal.woff2?url'
import { FONTS, type FontFaceFile, type ResolvedText } from './registry'

/*
 * Browser side of the font registry: the bundled file for each face, the
 * @font-face rules (the browser downloads a face only when text uses it),
 * and the raw data for embedding in exports.
 */

const URLS: Record<string, string> = {
  '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2': interNormal,
  '@fontsource-variable/inter/files/inter-latin-wght-italic.woff2': interItalic,
  '@fontsource-variable/source-serif-4/files/source-serif-4-latin-wght-normal.woff2': serifNormal,
  '@fontsource-variable/source-serif-4/files/source-serif-4-latin-wght-italic.woff2': serifItalic,
  '@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2': jetbrainsNormal,
  '@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-italic.woff2': jetbrainsItalic,
  '@fontsource-variable/caveat/files/caveat-latin-wght-normal.woff2': caveatNormal,
  '@fontsource-variable/nunito/files/nunito-latin-wght-normal.woff2': nunitoNormal,
  '@fontsource-variable/nunito/files/nunito-latin-wght-italic.woff2': nunitoItalic,
}

export const faceUrl = (face: FontFaceFile): string | undefined => URLS[face.file]

/** The files hold the latin subset only; other characters fall through to the fallback fonts. */
const LATIN = 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'
/** Already declared by the app stylesheet (@fontsource-variable/inter), with its other scripts. */
const DECLARED = new Set(['@fontsource-variable/inter/files/inter-latin-wght-normal.woff2'])

/** Adds the @font-face rules once. Inter's upright face also comes from the app stylesheet (with its other scripts). */
export function installFontFaces() {
  if (typeof document === 'undefined' || document.getElementById('cl-font-faces')) return
  let css = ''
  for (const font of FONTS) {
    for (const face of font.faces) {
      const url = faceUrl(face)
      if (!url || DECLARED.has(face.file)) continue
      css += `@font-face{font-family:'${font.family}';font-style:${face.style};font-display:swap;font-weight:${face.weight.min} ${face.weight.max};src:url(${url}) format('woff2');unicode-range:${LATIN}}\n`
    }
  }
  const style = document.createElement('style')
  style.id = 'cl-font-faces'
  style.textContent = css
  document.head.append(style)
}

/** The CSS `font` shorthand for loading or checking a resolved label's face. */
export const fontSpec = (t: Pick<ResolvedText, 'font' | 'weight' | 'italic' | 'size'>) => `${t.italic ? 'italic ' : ''}${t.weight} ${t.size}px '${t.font.family}'`

/** Resolves once the face is ready (or immediately if fonts can't be checked). */
export function loadFace(spec: string): Promise<void> {
  const fonts = typeof document === 'undefined' ? undefined : document.fonts
  if (!fonts || fonts.check(spec)) return Promise.resolve()
  return fonts.load(spec).then(
    () => undefined,
    () => undefined,
  )
}

const dataCache = new Map<string, Promise<string | null>>()

/** The face's file as base64, for embedding in an export. Null if it couldn't be read. */
export function faceBase64(face: FontFaceFile): Promise<string | null> {
  let pending = dataCache.get(face.file)
  if (!pending) {
    const url = faceUrl(face)
    pending = url
      ? fetch(url)
          .then((r) => r.arrayBuffer())
          .then((buffer) => {
            const bytes = new Uint8Array(buffer)
            let binary = ''
            for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
            return btoa(binary)
          })
          .catch(() => null)
      : Promise.resolve(null)
    dataCache.set(face.file, pending)
  }
  return pending
}
