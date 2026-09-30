import type { Stencil } from './format'

/*
 * Where the user's stencil library lives. The browser uses IndexedDB (store
 * "stencils"); tests use the in-memory version. Records are the stencil plus
 * its cached preview.
 */

export interface StencilRecord {
  id: string
  stencil: Stencil
  /** Cached preview SVG (see thumbnail.ts). */
  thumbnail: string
  /** Last change, for sorting. */
  updated: string
}

export interface StencilRepository {
  list(): Promise<StencilRecord[]>
  /** Writes all records in one transaction: all or nothing. */
  put(records: StencilRecord[]): Promise<void>
  remove(ids: string[]): Promise<void>
}

export function memoryRepository(initial: StencilRecord[] = []): StencilRepository & { records: Map<string, StencilRecord> } {
  const records = new Map(initial.map((r) => [r.id, structuredClone(r)]))
  return {
    records,
    list: async () => [...records.values()].map((r) => structuredClone(r)),
    async put(items) {
      for (const r of items) records.set(r.id, structuredClone(r))
    },
    async remove(ids) {
      for (const id of ids) records.delete(id)
    },
  }
}

const DB_NAME = 'chalkline'
const DB_VERSION = 1
const STORE = 'stencils'

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    // A full disk surfaces as the transaction aborting with QuotaExceededError.
    tx.onabort = () => reject(tx.error ?? new DOMException('Transaction aborted', 'AbortError'))
    tx.onerror = () => reject(tx.error)
  })
}

/** IndexedDB-backed library. Rejects (lazily, on first use) if IndexedDB is unavailable. */
export function indexedDbRepository(factory: IDBFactory | undefined = globalThis.indexedDB): StencilRepository {
  let db: Promise<IDBDatabase> | null = null
  const open = () => {
    db ??= new Promise<IDBDatabase>((resolve, reject) => {
      if (!factory) return reject(new DOMException('IndexedDB is not available', 'NotSupportedError'))
      const req = factory.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' })
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
      req.onblocked = () => reject(new DOMException('The stencil library is open in an older tab', 'InvalidStateError'))
    }).catch((error) => {
      db = null
      throw error
    })
    return db
  }
  return {
    async list() {
      const tx = (await open()).transaction(STORE, 'readonly')
      return request(tx.objectStore(STORE).getAll() as IDBRequest<StencilRecord[]>)
    },
    async put(records) {
      const tx = (await open()).transaction(STORE, 'readwrite')
      const store = tx.objectStore(STORE)
      for (const r of records) store.put(r)
      await done(tx)
    },
    async remove(ids) {
      const tx = (await open()).transaction(STORE, 'readwrite')
      const store = tx.objectStore(STORE)
      for (const id of ids) store.delete(id)
      await done(tx)
    },
  }
}
