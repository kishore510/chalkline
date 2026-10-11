/*
 * Diagram colours are stored as "#rrggbb" or "token:name". Token references
 * point at --cl-<name> in tokens.css, so they follow the light/dark theme.
 */

export const COLOUR_PRESETS = ['slate', 'blue', 'teal', 'green', 'amber', 'red', 'purple', 'yellow', 'steel', 'tan', 'pink'] as const
export type ColourPreset = (typeof COLOUR_PRESETS)[number]

export const PRESET_NAMES: Record<ColourPreset, string> = {
  slate: 'Slate',
  blue: 'Blue',
  teal: 'Teal',
  green: 'Green',
  amber: 'Amber',
  red: 'Red',
  purple: 'Purple',
  yellow: 'Yellow',
  steel: 'Steel',
  tan: 'Tan',
  pink: 'Pink',
}

/**
 * Layered EA views: the preset each layer uses, soft as a fill and strong as a
 * border. Several reuse general presets that already fit.
 */
export const LAYER_PRESETS = {
  business: 'yellow',
  data: 'teal',
  application: 'blue',
  technology: 'green',
  network: 'steel',
  strategy: 'tan',
  motivation: 'purple',
  implementation: 'pink',
} as const satisfies Record<string, ColourPreset>
export type LayerName = keyof typeof LAYER_PRESETS

/** Soft variants suit fills; strong variants suit borders, lines and text. */
export type PresetVariant = 'soft' | 'strong'

export function presetToken(preset: ColourPreset, variant: PresetVariant): string {
  return `token:swatch-${preset}${variant === 'soft' ? '-soft' : ''}`
}

const HEX = /^#[0-9a-f]{6}$/i
const TOKEN = /^token:([a-z0-9-]+)$/

/**
 * Turns a stored colour into a CSS value. Unknown or malformed values fall back,
 * and a token that doesn't exist in this build falls back through var().
 */
export function resolveColour(value: string | undefined, fallback: string): string {
  if (!value) return fallback
  if (HEX.test(value)) return value.toLowerCase()
  const token = value.match(TOKEN)
  return token ? `var(--cl-${token[1]}, ${fallback})` : fallback
}

/** Normalises a colour from <input type="color"> for storage. */
export function normaliseHex(value: string): string | null {
  return HEX.test(value) ? value.toLowerCase() : null
}

/**
 * The --cl-* hex colours a theme block of tokens.css sets, keyed by token name
 * (without --cl-). Lets code outside the browser (export, tests) read real
 * theme values from the one token file instead of copying them.
 */
export function parseThemeColours(css: string, theme: 'light' | 'dark'): Record<string, string> {
  const block = css.match(new RegExp(`\\[data-theme='${theme}'\\]\\s*\\{([^}]*)\\}`))?.[1] ?? ''
  const colours: Record<string, string> = {}
  for (const [, name, value] of block.matchAll(/--cl-([\w-]+):\s*(#[0-9a-f]{6,8})\s*;/gi)) colours[name!] = value!.toLowerCase()
  return colours
}
