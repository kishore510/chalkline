/**
 * Media queries for layout switches made in script. The widths must match
 * --breakpoint-md and --breakpoint-lg in tokens.css (a test checks this).
 */
export const BREAKPOINTS = { md: '48rem', lg: '64rem' } as const

export const MEDIA = {
  /** Tablet and up: side rail and slide-over properties. */
  tablet: `(min-width: ${BREAKPOINTS.md})`,
  /** Desktop: persistent palette and properties panel, top bar toolbar. */
  desktop: `(min-width: ${BREAKPOINTS.lg})`,
  reducedMotion: '(prefers-reduced-motion: reduce)',
  /** A mouse or trackpad: precise enough for dragging from small connection handles. */
  finePointer: '(hover: hover) and (pointer: fine)',
} as const
