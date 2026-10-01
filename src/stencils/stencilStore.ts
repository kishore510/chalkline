import { create } from 'zustand'
import { readToken } from '@/lib/cssVar'
import { readKey, writeKey } from '@/persistence/localStore'
import { STORAGE_KEYS } from '@/persistence/storageKeys'
import { BUILTIN_STENCILS, TEMPLATES } from './builtin'
import type { ParsedFile, Stencil, StencilContent } from './format'
import { createLibrary, LibraryError, type ClashChoice, type ImportPlan, type ImportResult, type Library, type StencilDetails } from './library'
import { indexedDbRepository, type StencilRecord } from './repository'
import { cleanRecentStencils, pushRecentStencil } from './search'
import { diagramThumbnail, stencilThumbnail, thumbnailEnv } from './thumbnail'

/*
 * Browser wiring for the stencil library: the library module on IndexedDB,
 * with previews sized from the design tokens, plus the palette's recently used
 * list and which stencil dialog is open. Nothing here is part of the diagram.
 */

// Font sizes don't matter here: previews are drawn without labels.
const env = () =>
  thumbnailEnv({
    fontSize: 15,
    lineHeight: 1.35,
    nodePadding: readToken('--cl-node-padding', 8),
    nodeStrokeWidth: readToken('--cl-node-stroke-width', 1.5),
    edgeWidth: readToken('--cl-edge-width', 1.5),
    freeLabelMax: readToken('--cl-label-free-max', 200),
    edgeLabelFontSize: 12,
  })

/** Preview of content not (yet) in the library, e.g. in the save dialog. */
export const previewThumbnail = (content: StencilContent) => stencilThumbnail(content, env())

// Built-in previews are made on first use and kept for the session.
const builtinPreviews = new Map<string, string>()
export function builtinThumbnail(id: string): string {
  let svg = builtinPreviews.get(id)
  if (svg === undefined) {
    const stencil = BUILTIN_STENCILS.find((s) => s.id === id)
    const template = TEMPLATES.find((t) => t.id === id)
    svg = stencil ? previewThumbnail(stencil.content) : template ? diagramThumbnail(template.diagram, env()) : ''
    builtinPreviews.set(id, svg)
  }
  return svg
}

const RECENTS_KEY = STORAGE_KEYS.recentStencils.key

function loadRecents(): string[] {
  try {
    return cleanRecentStencils(JSON.parse(readKey(RECENTS_KEY) ?? '[]'))
  } catch {
    return []
  }
}

export type StencilDialog =
  | { kind: 'save'; content: StencilContent }
  | { kind: 'edit'; id: string; focus: 'name' | 'category' }
  | { kind: 'import'; plan: ImportPlan }
  | { kind: 'templates' }

interface StencilState {
  status: 'idle' | 'loading' | 'ready' | 'unavailable'
  /** Why the library couldn't be read, if so. */
  problem: string | null
  items: StencilRecord[]
  categories: string[]
  recents: string[]
  dialog: StencilDialog | null
  openDialog: (dialog: StencilDialog) => void
  closeDialog: () => void
  /** Reads the library once (later calls do nothing). */
  ensureLoaded: () => Promise<void>
  noteUsed: (id: string) => void
  /* Library changes. These throw LibraryError with a message to show. */
  save: (details: StencilDetails, content: StencilContent) => Promise<StencilRecord>
  update: (id: string, details: StencilDetails) => Promise<StencilRecord>
  remove: (id: string) => Promise<StencilRecord | null>
  restore: (record: StencilRecord) => Promise<void>
  duplicate: (stencil: Stencil, thumbnail?: string) => Promise<StencilRecord>
  planImport: (file: ParsedFile) => ImportPlan
  applyImport: (plan: ImportPlan, choice: ClashChoice) => Promise<ImportResult>
  exportOne: (stencil: Stencil) => { fileName: string; text: string }
  /** Restoring a backup: the library becomes exactly these stencils. */
  replaceAll: (stencils: Stencil[]) => Promise<void>
  exportAll: () => { fileName: string; text: string }
}

let library: Library | null = null
const lib = () => (library ??= createLibrary({ repository: indexedDbRepository(), thumbnail: previewThumbnail }))

export const useStencilStore = create<StencilState>()((set, get) => {
  /** Runs a library change, then refreshes the list. */
  const change = async <T>(run: (l: Library) => Promise<T>): Promise<T> => {
    await get().ensureLoaded()
    if (get().status === 'unavailable') throw new LibraryError(get().problem ?? 'The stencil library isn’t available.')
    const result = await run(lib())
    set({ items: lib().all(), categories: lib().categories() })
    return result
  }

  return {
    status: 'idle',
    problem: null,
    items: [],
    categories: [],
    recents: loadRecents(),
    dialog: null,
    openDialog: (dialog) => set({ dialog }),
    closeDialog: () => set({ dialog: null }),

    async ensureLoaded() {
      if (get().status !== 'idle') return
      set({ status: 'loading' })
      try {
        const items = await lib().load()
        set({ status: 'ready', items, categories: lib().categories(), problem: null })
      } catch (error) {
        set({ status: 'unavailable', problem: (error as Error).message })
      }
    },

    noteUsed(id) {
      const recents = pushRecentStencil(get().recents, id)
      // If storage refuses, the list just isn't remembered next time.
      writeKey(RECENTS_KEY, JSON.stringify(recents))
      set({ recents })
    },

    save: (details, content) => change((l) => l.save(details, content)),
    update: (id, details) => change((l) => l.update(id, details)),
    remove: (id) => change((l) => l.remove(id)),
    restore: (record) => change((l) => l.restore(record)),
    duplicate: (stencil, thumbnail) => change((l) => l.duplicate(stencil, thumbnail)),
    planImport: (file) => lib().planImport(file),
    applyImport: (plan, choice) => change((l) => l.applyImport(plan, choice)),
    exportOne: (stencil) => lib().exportOne(stencil),
    replaceAll: (stencils) => change((l) => l.replaceAll(stencils)),
    exportAll: () => lib().exportAll(),
  }
})
