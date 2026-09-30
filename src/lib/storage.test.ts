import { describe, expect, it } from 'vitest'
import { formatBytes, storageUsed } from './storage'

describe('formatBytes', () => {
  it('picks a readable unit', () => {
    expect(formatBytes(0)).toBe('0 bytes')
    expect(formatBytes(740)).toBe('740 bytes')
    expect(formatBytes(12_595)).toBe('12 KB')
    expect(formatBytes(4_300)).toBe('4.2 KB')
    expect(formatBytes(4.1 * 1024 * 1024)).toBe('4.1 MB')
    expect(formatBytes(-1)).toBe('unknown')
  })
})

describe('storageUsed', () => {
  it('reads the estimate, or null where unavailable', async () => {
    expect(await storageUsed({ estimate: async () => ({ usage: 2048, quota: 1e9 }) })).toBe(2048)
    expect(await storageUsed({ estimate: async () => ({}) })).toBeNull()
    expect(await storageUsed(undefined)).toBeNull()
    expect(
      await storageUsed({
        estimate: async () => {
          throw new Error('denied')
        },
      }),
    ).toBeNull()
  })
})
