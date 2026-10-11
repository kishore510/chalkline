import { Copy, Download } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { announce } from '@/a11y/announce'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import type { MermaidDirection, MermaidExport } from '@/export/mermaid'
import { fileNameFor } from '@/persistence/serialize'
import type { Diagram } from '@/schema/diagram'
import { Choice } from '@/settings/Choice'
import { ToggleField } from './fields'

const DIRECTIONS: { value: MermaidDirection; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'TD', label: 'Top-down' },
  { value: 'LR', label: 'Left-right' },
]

/**
 * Mermaid export: options, a read-only preview, what is lost, then download
 * or copy. Reads the diagram as it was when opened; never changes it.
 */
export function MermaidDialog({ diagram, onClose }: { diagram: Diagram; onClose: () => void }) {
  const [direction, setDirection] = useState<MermaidDirection>('auto')
  const [includeNotes, setIncludeNotes] = useState(false)
  const [result, setResult] = useState<MermaidExport | null>(null)
  const [status, setStatus] = useState<{ text: string; error: boolean } | null>(null)
  const previewRef = useRef<HTMLTextAreaElement>(null)
  const previewId = useId()

  // Built only here, when the sheet opens or an option changes (the export code loads on first use).
  useEffect(() => {
    let current = true
    void import('@/export/mermaid').then(({ toMermaid }) => {
      if (current) setResult(toMermaid(diagram, { direction, includeNotes }))
    })
    return () => {
      current = false
    }
  }, [diagram, direction, includeNotes])

  const say = (text: string, error = false) => {
    setStatus({ text, error })
    announce(text)
  }

  function copy() {
    if (!result) return
    const selectAll = () => {
      previewRef.current?.focus()
      previewRef.current?.select()
    }
    const failed = () => {
      selectAll()
      say('Couldn’t copy automatically. The text is selected: use your device’s Copy, or Download instead.', true)
    }
    const writing = navigator.clipboard?.writeText(result.text)
    if (!writing) return failed()
    writing.then(() => say('Copied to clipboard.'), failed)
  }

  async function download() {
    if (!result) return
    const { downloadText } = await import('@/persistence/download')
    const name = fileNameFor(diagram.meta.title, 'mmd')
    await downloadText(result.text, name, 'text/plain;charset=utf-8')
    say(`Downloaded ${name}.`)
  }

  return (
    <Dialog
      title="Export as Mermaid"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={copy} disabled={!result}>
            <Copy />
            Copy to clipboard
          </Button>
          <Button variant="primary" onClick={() => void download()} disabled={!result}>
            <Download />
            Download .mmd
          </Button>
        </>
      }
    >
      <p className="text-sm text-text-muted">A Mermaid flowchart you can paste into Markdown, wikis and docs that render Mermaid.</p>
      <Choice label="Direction" value={direction} options={DIRECTIONS} onChange={setDirection} />
      <ToggleField label="Include notes" pressed={includeNotes} onChange={setIncludeNotes} />
      <div className="flex min-w-0 flex-col gap-1.5">
        <label htmlFor={previewId} className="text-sm font-medium text-text">
          Preview
        </label>
        <textarea
          id={previewId}
          ref={previewRef}
          readOnly
          wrap="off"
          spellCheck={false}
          value={result?.text ?? 'Preparing…'}
          rows={10}
          className="max-h-(--cl-code-preview-max-height) min-h-touch w-full min-w-0 resize-none overflow-auto rounded-md border border-border bg-surface-muted p-2 font-mono text-xs text-text"
        />
      </div>
      {status && (
        <p role="status" className={status.error ? 'text-sm text-danger' : 'text-sm text-text-muted'}>
          {status.text}
        </p>
      )}
      <section aria-label="What is not included" className="flex flex-col gap-1.5">
        <h3 className="text-sm font-medium text-text">What is not included</h3>
        {result && result.warnings.length > 0 ? (
          <ul className="list-disc space-y-1 pl-5 text-sm text-text-muted">
            {result.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-text-muted">{result ? 'Nothing: everything in this diagram has a Mermaid equivalent.' : '…'}</p>
        )}
      </section>
    </Dialog>
  )
}
