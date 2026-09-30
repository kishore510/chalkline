/** Width of `text` in px at `fontSize`; injected so wrapping is testable without a browser. */
export type Measure = (text: string, fontSize: number) => number

/**
 * Breaks a label into lines no wider than `maxWidth`, matching the canvas:
 * explicit newlines are kept, lines wrap at spaces, and a word is split
 * mid-word only if it can't fit on a line by itself.
 */
export function wrapText(label: string, maxWidth: number, fontSize: number, measure: Measure): string[] {
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
      if (measure(candidate, fontSize) <= maxWidth) {
        line = candidate
        continue
      }
      if (line) lines.push(line)
      if (measure(word, fontSize) <= maxWidth) {
        line = word
        continue
      }
      // Fallback for a single word too long for any line: split it by characters.
      let piece = ''
      for (const char of word) {
        if (piece && measure(piece + char, fontSize) > maxWidth) {
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
