import { create } from 'zustand'
import { announce } from '@/a11y/announce'
import { spokenError, type FriendlyError } from '@/errors/friendly'
import { getApiKey } from './keyStore'
import { aiError } from './messages'
import { AI_MODELS } from './models'

/*
 * AI view state: what's in flight and how the last attempt went. Never
 * saved, never an undo step, never exported; gone on reload. The request
 * code loads on the first send.
 */

export interface TestResult {
  ok: boolean
  /** When it finished (ms since epoch). */
  at: number
}

interface AiState {
  sending: boolean
  lastTest: TestResult | null
  /** The last failure, shown with a Retry button. */
  problem: FriendlyError | null
  runTest: () => Promise<void>
  cancel: () => void
  /** Forget results (the key was replaced or removed). */
  reset: () => void
}

let controller: AbortController | null = null

export const useAiStore = create<AiState>()((set, get) => ({
  sending: false,
  lastTest: null,
  problem: null,

  async runTest() {
    if (get().sending) return
    const key = getApiKey()
    if (!key) {
      const problem = aiError('ai-no-key')
      set({ problem })
      announce(spokenError(problem))
      return
    }
    controller = new AbortController()
    const { signal } = controller
    set({ sending: true, problem: null })
    announce('Testing your key…')
    const { testKey } = await import('./client')
    const outcome = await testKey(key, AI_MODELS.small, { signal })
    controller = null
    // The key was removed or replaced meanwhile: this result is about a key that's gone.
    if (getApiKey() !== key) {
      set({ sending: false })
      return
    }
    if (outcome.ok) {
      set({ sending: false, lastTest: { ok: true, at: Date.now() } })
      announce(`Your key works with ${AI_MODELS.small.name}.`)
      return
    }
    // A cancelled test says nothing about the key.
    set({ sending: false, problem: outcome.error, ...(outcome.reason !== 'cancelled' && { lastTest: { ok: false, at: Date.now() } }) })
    announce(spokenError(outcome.error))
  },

  cancel() {
    controller?.abort()
  },

  reset() {
    controller?.abort()
    set({ lastTest: null, problem: null })
  },
}))
