import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { RenderErrorBoundary } from './ErrorViews'

/*
 * A diagram that can't be drawn: the boundary shows a way out instead of a
 * blank screen. (Error boundaries don't run during server rendering, so the
 * caught state is set directly.)
 */

describe('render error boundary', () => {
  it('turns any thrown value into the friendly render-failed message with its detail', () => {
    expect(RenderErrorBoundary.getDerivedStateFromError(new Error('Cannot read x of undefined')).error).toMatchObject({
      kind: 'render-failed',
      detail: 'Cannot read x of undefined',
    })
    expect(RenderErrorBoundary.getDerivedStateFromError('boom').error.detail).toBe('boom')
  })

  it('shows the recovery actions, plus Try again, instead of the canvas', () => {
    const actions = [
      { label: 'Export JSON', run: () => {}, primary: true },
      { label: 'Start a new diagram', run: () => {} },
    ]
    const boundary = new RenderErrorBoundary({ actions, children: <p>the-diagram</p> })
    expect(renderToStaticMarkup(<>{boundary.render()}</>)).toContain('the-diagram')

    boundary.state = RenderErrorBoundary.getDerivedStateFromError(new Error('bad'))
    const html = renderToStaticMarkup(<>{boundary.render()}</>)
    expect(html).not.toContain('the-diagram')
    expect(html).toContain('role="alert"')
    expect(html).toContain('Chalkline couldn’t show this diagram')
    for (const label of ['Export JSON', 'Start a new diagram', 'Try again', 'Details']) expect(html).toContain(label)
  })
})
