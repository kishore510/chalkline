/** Rough, readable size: "740 bytes", "12.3 KB", "4.1 MB". */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return 'unknown'
  if (bytes < 1024) return `${Math.round(bytes)} bytes`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`
}

/** Bytes this site stores in the browser, or null where the browser won't say. Local only; no network. */
export async function storageUsed(storage: Pick<StorageManager, 'estimate'> | undefined = globalThis.navigator?.storage): Promise<number | null> {
  try {
    const estimate = await storage?.estimate?.()
    return typeof estimate?.usage === 'number' ? estimate.usage : null
  } catch {
    return null
  }
}
