import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ExportEnv } from '@/export/svg'
import { parseThemeColours } from '@/lib/colour'
import { thumbnailEnv } from './thumbnail'

/* Shared by the stencil tests: real theme colours from tokens.css, fixed sizes. */

const css = readFileSync(join(import.meta.dirname, '..', 'styles', 'tokens.css'), 'utf8')

export const themeColours = (theme: 'light' | 'dark'): Record<string, string> => parseThemeColours(css, theme)

export const SIZES = { fontSize: 15, lineHeight: 1.35, nodePadding: 8, nodeStrokeWidth: 1.5, edgeWidth: 1.5, freeLabelMax: 200, edgeLabelFontSize: 12 }

export const themeEnv = (theme: 'light' | 'dark'): ExportEnv => {
  const colours = themeColours(theme)
  return { ...thumbnailEnv(SIZES), colour: (token) => colours[token] ?? '' }
}

export const testThumbnailEnv = thumbnailEnv(SIZES)
