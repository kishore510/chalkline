import { afterEach, describe, expect, it } from 'vitest'
import { friendlyError } from '@/errors/friendly'
import { containsSecret, REDACTED, redactSecrets, registerSecret, resetSecretsForTests } from './redact'

const FAKE = 'sk-ant-api03-FAKEkey_0123456789-abcdefXYZ'

afterEach(() => resetSecretsForTests())

describe('redaction', () => {
  it('removes a key-shaped string anywhere in the text', () => {
    const text = `Request failed with key ${FAKE}. Try again.`
    expect(redactSecrets(text)).toBe(`Request failed with key ${REDACTED}. Try again.`)
    expect(redactSecrets(text)).not.toContain('FAKEkey')
  })

  it('removes a registered key of any shape, every time it appears', () => {
    const odd = 'custom-proxy-token-1234567890'
    registerSecret(odd)
    expect(redactSecrets(`${odd} and again ${odd}`)).toBe(`${REDACTED} and again ${REDACTED}`)
  })

  it('removes x-api-key header values in JSON, header and query forms', () => {
    for (const text of ['{"x-api-key":"abc123secretvalue"}', 'x-api-key: abc123secretvalue', 'x-api-key=abc123secretvalue&y=1']) {
      expect(redactSecrets(text)).not.toContain('abc123secretvalue')
    }
  })

  it('leaves ordinary text alone, and ignores very short registered strings', () => {
    registerSecret('abc')
    const text = 'abc: The API returned 429 rate_limit_error. sk-ant is the key prefix.'
    expect(redactSecrets(text)).toBe(text)
    expect(containsSecret(text)).toBe(false)
  })

  it('a removed key stays redacted', () => {
    registerSecret('my-old-key-1234567890')
    expect(containsSecret('… my-old-key-1234567890 …')).toBe(true)
  })

  it('every friendly error detail is redacted (thrown messages, stack traces)', () => {
    const thrown = new Error(`Failed to fetch with header x-api-key: ${FAKE}`)
    const e = friendlyError('render-failed', `${thrown.message}\n${thrown.stack ?? ''}`)
    expect(e.detail).toBeDefined()
    expect(e.detail).not.toContain(FAKE)
    expect(e.detail).not.toContain('FAKEkey')
    expect(e.detail).toContain(REDACTED)
  })
})
