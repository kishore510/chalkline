// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { parseChangelogItem } from './changelog'
import { parseMarkdown } from './markdown'
import { InlineMarkdown, Markdown } from './Markdown'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | undefined
let host: HTMLElement | undefined

function render(node: React.ReactNode) {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  act(() => root!.render(node))
  return host
}

afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
})

describe('What’s new items', () => {
  it('render **bold** and `code` as elements, not literal markers', () => {
    const el = render(<InlineMarkdown nodes={parseChangelogItem('**Refine with AI**: press `Ctrl Z` to undo.')} />)
    expect(el.querySelector('strong')?.textContent).toBe('Refine with AI')
    expect(el.querySelector('kbd')?.textContent).toBe('Ctrl Z')
    expect(el.textContent).toBe('Refine with AI: press Ctrl Z to undo.')
    expect(el.textContent).not.toContain('**')
  })

  it('render no links, images or HTML', () => {
    const el = render(<InlineMarkdown nodes={parseChangelogItem('[site](https://example.com) ![x](https://example.com/x.png) <img src="x"><script>alert(1)</script>')} />)
    expect(el.querySelector('a, img, script, button')).toBeNull()
  })
})

describe('Help topics', () => {
  it('still render bold and help links', () => {
    const el = render(<Markdown blocks={parseMarkdown('Choose **Export**, see [shapes](help:shapes-reference).')} />)
    expect(el.querySelector('strong')?.textContent).toBe('Export')
    expect(el.querySelector('button')?.textContent).toBe('shapes')
  })
})
