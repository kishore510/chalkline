import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/*
 * Every icon-only button has a name screen readers can read. Icon-only means
 * <Button size="icon">, or a raw <button> sized like one (size-touch, or a
 * token size). A static check over the source, so nothing slips through
 * untested screens.
 */

const SRC = join(import.meta.dirname, '..')
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? files(path) : path.endsWith('.tsx') && !path.endsWith('.test.tsx') ? [path] : []
  })

/** JSX opening tags of `tag`, spanning lines; nested braces in attributes are allowed. */
function openingTags(source: string, tag: string): { text: string; line: number }[] {
  const out: { text: string; line: number }[] = []
  const re = new RegExp(`<${tag}[\\s>]`, 'g')
  for (let m = re.exec(source); m; m = re.exec(source)) {
    let depth = 0
    let i = m.index + 1
    for (; i < source.length; i++) {
      const c = source[i]
      if (c === '{') depth++
      else if (c === '}') depth--
      else if (c === '>' && depth === 0 && source[i - 1] !== '=') break
    }
    out.push({ text: source.slice(m.index, i + 1), line: source.slice(0, m.index).split('\n').length })
  }
  return out
}

const named = (tag: string) => /aria-label(ledby)?=/.test(tag) || /\{\.\.\.props\}/.test(tag)

describe('icon-only buttons have accessible names', () => {
  it.each(files(SRC).map((f) => [relative(SRC, f), f] as const))('%s', (_, file) => {
    const source = readFileSync(file, 'utf8')
    const missing: string[] = []
    for (const tag of openingTags(source, 'Button')) if (/size="icon"/.test(tag.text) && !named(tag.text)) missing.push(`line ${tag.line}`)
    for (const tag of openingTags(source, 'button')) if (/size-touch|size-\(--/.test(tag.text) && !named(tag.text)) missing.push(`line ${tag.line}`)
    expect(missing).toEqual([])
  })
})
