import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { COLOUR_PRESETS } from '@/lib/colour'

const SRC = join(import.meta.dirname, '..')
const TOKENS_FILE = join(import.meta.dirname, 'tokens.css')
const tokensCss = readFileSync(TOKENS_FILE, 'utf8')

type Theme = 'light' | 'dark'

function themeBlock(theme: Theme): string {
  const match = tokensCss.match(new RegExp(`\\[data-theme='${theme}'\\]\\s*\\{([^}]*)\\}`))
  if (!match?.[1]) throw new Error(`No ${theme} block in tokens.css`)
  return match[1]
}

function readColours(theme: Theme): Record<string, string> {
  const colours: Record<string, string> = {}
  for (const [, name, value] of themeBlock(theme).matchAll(/--cl-([\w-]+):\s*(#[0-9a-f]{6,8})\s*;/gi)) {
    colours[name!] = value!.toLowerCase()
  }
  return colours
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

// WCAG 2.1: 4.5:1 for text, 3:1 for UI components and graphics.
const TEXT = 4.5
const UI = 3

const PAIRS: [foreground: string, background: string, min: number][] = [
  ['text', 'bg', TEXT],
  ['text', 'canvas', TEXT],
  ['text', 'surface', TEXT],
  ['text', 'surface-muted', TEXT],
  ['text-muted', 'bg', TEXT],
  ['text-muted', 'canvas', TEXT],
  ['text-muted', 'surface', TEXT],
  ['text-muted', 'surface-muted', TEXT],
  ['accent', 'surface', TEXT],
  ['accent', 'bg', TEXT],
  ['on-accent', 'accent', TEXT],
  ['on-accent', 'accent-hover', TEXT],
  ['danger', 'surface', TEXT],
  ['on-danger', 'danger', TEXT],
  ['node-text', 'node-fill', TEXT],
  ['node-text', 'canvas', TEXT],
  ['node-stroke', 'canvas', UI],
  ['node-stroke', 'node-fill', UI],
  ['edge', 'canvas', UI],
  ['accent', 'canvas', UI],
  ['accent', 'node-fill', UI],
  ['focus', 'bg', UI],
  ['focus', 'surface', UI],
  ['focus', 'canvas', UI],
  ['border-strong', 'surface', UI],
  ['border-strong', 'bg', UI],
]

// Diagram presets are used as text and borders on any fill, so hold them to text contrast.
for (const name of COLOUR_PRESETS) {
  PAIRS.push(
    [`swatch-${name}`, 'canvas', TEXT],
    [`swatch-${name}`, 'node-fill', TEXT],
    [`swatch-${name}`, `swatch-${name}-soft`, TEXT],
    ['node-text', `swatch-${name}-soft`, TEXT],
  )
}

describe.each<Theme>(['light', 'dark'])('%s theme', (theme) => {
  const colours = readColours(theme)

  it('defines the same colour tokens as the other theme', () => {
    const other = readColours(theme === 'light' ? 'dark' : 'light')
    expect(Object.keys(colours).sort()).toEqual(Object.keys(other).sort())
  })

  it.each(PAIRS)('%s on %s meets %s:1', (fg, bg, min) => {
    expect(colours[fg], `--cl-${fg} missing`).toMatch(/^#[0-9a-f]{6}$/)
    expect(colours[bg], `--cl-${bg} missing`).toMatch(/^#[0-9a-f]{6}$/)
    expect(contrast(colours[fg]!, colours[bg]!)).toBeGreaterThanOrEqual(min)
  })
})

describe('no hard-coded design values outside tokens.css', () => {
  function walk(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name)
      if (statSync(path).isDirectory()) return name === 'fixtures' ? [] : walk(path)
      return /\.(tsx?|css)$/.test(name) && !name.endsWith('.test.ts') ? [path] : []
    })
  }

  const RULES: [label: string, pattern: RegExp][] = [
    ['hex colour', /#[0-9a-f]{3,8}\b(?![-\w])/i],
    ['colour function', /\b(?:rgba?|hsla?|oklch|oklab|lab|lch|color)\(/i],
    ['named colour', /:\s*(?:white|black|red|blue|green|gray|grey)\s*[;}]/i],
    ['Tailwind arbitrary value', /\b[a-z][\w-]*-\[(?!var\()[^\]]*\]/],
    ['Tailwind default palette', /\b(?:bg|text|border|fill|stroke|ring|outline)-(?:slate|gray|zinc|neutral|stone|red|blue|green|white|black)\b/],
    ['px length in CSS', /:\s*[^;]*\b\d+(?:\.\d+)?px\b/],
  ]

  const files = walk(SRC).filter((file) => file !== TOKENS_FILE)

  it('scans some files', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it.each(files.map((file) => [relative(SRC, file), file]))('%s', (_name, file) => {
    const violations: string[] = []
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, index) => {
        if (/^\s*(?:\/\/|\*|\/\*)/.test(line)) return
        for (const [label, pattern] of RULES) {
          if (label === 'px length in CSS' && !file.endsWith('.css')) continue
          if (pattern.test(line)) violations.push(`line ${index + 1}: ${label}: ${line.trim()}`)
        }
      })
    expect(violations).toEqual([])
  })
})
