/** How a run of text is drawn, for measuring it with the right font. */
export interface MeasureFace {
  /** CSS font-family value. */
  family: string
  weight: number
  italic: boolean
}

/** Width of `text` in px at `fontSize` in `face`; injected so wrapping is testable without a browser. */
export type Measure = (text: string, fontSize: number, face?: MeasureFace) => number

/**
 * Breaks a label into lines no wider than `maxWidth`, matching the canvas:
 * explicit newlines are kept, lines wrap at spaces, and a word is split
 * mid-word only if it can't fit on a line by itself.
 */
export function wrapText(label: string, maxWidth: number, fontSize: number, measure: Measure, face?: MeasureFace): string[] {
  const width = (text: string) => measure(text, fontSize, face)
  const lines: string[] = []
  for (const paragraph of label.split('\n')) {
    const words = paragraph.split(/\s+/).filter(Boolean)
    if (words.length === 0) {
      lines.push('')
      continue
    }
    let line = ''
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word
      if (width(candidate) <= maxWidth) {
        line = candidate
        continue
      }
      if (line) lines.push(line)
      if (width(word) <= maxWidth) {
        line = word
        continue
      }
      // Fallback for a single word too long for any line: split it by characters.
      let piece = ''
      for (const char of word) {
        if (piece && width(piece + char) > maxWidth) {
          lines.push(piece)
          piece = char
        } else {
          piece += char
        }
      }
      line = piece
    }
    lines.push(line)
  }
  return lines
}

/** Height a label's wrapped text needs: lines times line height. */
export function textBlockHeight(label: string, maxWidth: number, fontSize: number, lineHeight: number, measure: Measure, face?: MeasureFace): number {
  return wrapText(label, maxWidth, fontSize, measure, face).length * fontSize * lineHeight
}
