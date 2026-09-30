import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ExportEnv } from '@/export/svg'
import { thumbnailEnv } from './thumbnail'

/* Shared by the stencil tests: real theme colours from tokens.css, fixed sizes. */

const css = readFileSync(join(import.meta.dirname, '..', 'styles', 'tokens.css'), 'utf8')

export function themeColours(theme: 'light' | 'dark'): Record<string, string> {
  const block = css.match(new RegExp(`\\[data-theme='${theme}'\\]\\s*\\{([^}]*)\\}`))?.[1] ?? ''
  const colours: Record<string, string> = {}
  for (const [, name, value] of block.matchAll(/--cl-([\w-]+):\s*(#[0-9a-f]{6,8})\s*;/gi)) colours[name!] = value!.toLowerCase()
  return colours
}

export const SIZES = { fontSize: 15, lineHeight: 1.35, nodePadding: 8, nodeStrokeWidth: 1.5, edgeWidth: 1.5, freeLabelMax: 200, edgeLabelFontSize: 12 }

export const themeEnv = (theme: 'light' | 'dark'): ExportEnv => {
  const colours = themeColours(theme)
  return { ...thumbnailEnv(SIZES), colour: (token) => colours[token] ?? '' }
}

export const testThumbnailEnv = thumbnailEnv(SIZES)
