/*
 * Diagram colours are stored as "#rrggbb" or "token:name". Token references
 * point at --cl-<name> in tokens.css, so they follow the light/dark theme.
 */

export const COLOUR_PRESETS = ['slate', 'blue', 'teal', 'green', 'amber', 'red', 'purple'] as const
export type ColourPreset = (typeof COLOUR_PRESETS)[number]

export const PRESET_NAMES: Record<ColourPreset, string> = {
  slate: 'Slate',
  blue: 'Blue',
  teal: 'Teal',
  green: 'Green',
  amber: 'Amber',
  red: 'Red',
  purple: 'Purple',
}

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
