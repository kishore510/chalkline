import type { ElkLike } from './computeLayout'

/*
 * ELK for the app. Loaded on demand (this module is only reached through a
 * dynamic import) and run in a Web Worker so big layouts don't freeze the UI.
 * Falls back to running on the main thread where workers aren't available.
 */

let instance: Promise<ElkLike> | null = null

export function getElk(): Promise<ElkLike> {
  instance ??= (async () => {
    if (typeof Worker !== 'undefined') {
      const [{ default: ELK }, { default: ElkWorker }] = await Promise.all([import('elkjs/lib/elk-api.js'), import('elkjs/lib/elk-worker.min.js?worker')])
      return new ELK({ workerFactory: () => new ElkWorker() })
    }
    const { default: ELK } = await import('elkjs/lib/elk.bundled.js')
    return new ELK()
  })()
  return instance
}
