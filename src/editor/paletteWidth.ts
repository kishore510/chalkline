/*
 * Desktop palette width limits. The width and collapsed state themselves are
 * remembered in settings (panels section). Not part of the diagram.
 */

/** The palette may take at most this share of the window, so the canvas keeps room. */
export const MAX_WINDOW_SHARE = 0.4
/** Dragging this far below the minimum width collapses the palette on release. */
export const COLLAPSE_SLACK = 64

/** The widest the palette may be: the token maximum, or a share of the window, but never under the minimum. */
export const maxPaletteWidth = (min: number, max: number, windowWidth: number) => Math.max(min, Math.min(max, Math.floor(windowWidth * MAX_WINDOW_SHARE)))

export const clampPaletteWidth = (width: number, min: number, max: number) => Math.round(Math.min(max, Math.max(min, width)))

/** Released well below the minimum: collapse instead of resizing. */
export const shouldCollapse = (width: number, min: number) => width < min - COLLAPSE_SLACK
