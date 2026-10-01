import { useDiagramStore } from '@/store/diagramStore'
import { fileNameFor, serializeDiagram } from './serialize'

/*
 * Saving files to the person's device. The download code loads on first use.
 */

/** Downloads text as a file. */
export async function downloadText(text: string, fileName: string, type = 'application/json') {
  const { downloadBlob } = await import('@/export/browser')
  downloadBlob(new Blob([text], { type }), fileName)
}

/** Downloads the diagram as canonical JSON (the backup and sharing format). */
export async function saveJson() {
  const { diagram } = useDiagramStore.getState()
  let text: string
  try {
    text = serializeDiagram(diagram)
  } catch {
    // Something in the diagram can't be written canonically: keep the data anyway.
    text = JSON.stringify(diagram, null, 2)
  }
  await downloadText(text, fileNameFor(diagram.meta.title, 'json'))
}
