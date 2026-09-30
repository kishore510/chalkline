import { extractStencilContent, EXTRACT_MESSAGES } from '@/stencils/fragment'
import { MAX_FILE_BYTES, parseStencilFile, StencilFileError, type Stencil } from '@/stencils/format'
import { describeImport } from '@/stencils/library'
import { useStencilStore } from '@/stencils/stencilStore'
import { useDiagramStore } from '@/store/diagramStore'
import { useUiStore } from '@/store/uiStore'

/* Stencil commands shared by the palette, properties, context menu and bars. */

const notify = (text: string, action?: { label: string; run: () => void }) => useUiStore.getState().notify(text, action)

/** Opens the "Save as stencil" dialog for the selection, or says why it can't. */
export function saveSelectionAsStencil() {
  const { diagram, selection } = useDiagramStore.getState()
  const result = extractStencilContent(diagram, selection)
  if (!result.ok) return notify(EXTRACT_MESSAGES[result.reason])
  useUiStore.getState().closeContextMenu()
  useStencilStore.getState().openDialog({ kind: 'save', content: result.content })
}

export async function downloadText(text: string, fileName: string) {
  const { downloadBlob } = await import('@/export/browser')
  downloadBlob(new Blob([text], { type: 'application/json' }), fileName)
}

export function exportStencil(stencil: Stencil) {
  const { fileName, text } = useStencilStore.getState().exportOne(stencil)
  void downloadText(text, fileName)
}

export async function exportLibrary() {
  const store = useStencilStore.getState()
  await store.ensureLoaded()
  if (useStencilStore.getState().items.length === 0) return notify('Your library is empty: nothing to export.')
  const { fileName, text } = store.exportAll()
  void downloadText(text, fileName)
}

/** Reads a stencil or library file; asks about name clashes, otherwise imports straight away. */
export async function importStencilFile(file: File) {
  const store = useStencilStore.getState()
  try {
    if (file.size > MAX_FILE_BYTES) throw new StencilFileError('That file is larger than 2 MB, the most Chalkline imports.')
    const parsed = parseStencilFile(await file.text())
    await store.ensureLoaded()
    const plan = store.planImport(parsed)
    if (plan.clashes.length > 0) return store.openDialog({ kind: 'import', plan })
    notify(describeImport(await store.applyImport(plan, 'keep-both')))
  } catch (error) {
    notify(error instanceof Error ? error.message : 'That file couldn’t be imported.')
  }
}

/** Deletes a stencil from the library, with Undo. */
export async function deleteStencil(id: string) {
  const store = useStencilStore.getState()
  try {
    const removed = await store.remove(id)
    if (!removed) return
    notify(`Deleted “${removed.stencil.name}”.`, {
      label: 'Undo',
      run: () => void store.restore(removed).catch((error: Error) => notify(error.message)),
    })
  } catch (error) {
    notify((error as Error).message)
  }
}

export async function duplicateStencil(stencil: Stencil, thumbnail?: string) {
  try {
    const copy = await useStencilStore.getState().duplicate(stencil, thumbnail)
    notify(`Added “${copy.stencil.name}” to My library.`)
    return copy
  } catch (error) {
    notify((error as Error).message)
    return null
  }
}
