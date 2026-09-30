import { Download, FilePlus } from 'lucide-react'
import { useState } from 'react'
import { useCanvasActions } from '@/canvas/useCanvasActions'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { createEmptyDiagram, type Diagram } from '@/schema/diagram'
import { TEMPLATES } from '@/stencils/builtin'
import { categoriesOf } from '@/stencils/search'
import { builtinThumbnail, useStencilStore } from '@/stencils/stencilStore'
import { diagramFromTemplate, hasContent, type Template } from '@/stencils/templates'
import { useDiagramStore } from '@/store/diagramStore'
import { useUiStore } from '@/store/uiStore'
import { saveJson } from '../FileMenu'
import { CategoryChips } from './CategoryChips'
import { Thumbnail } from './Thumbnail'

const CATEGORIES = categoriesOf(TEMPLATES)

/**
 * The New diagram flow: a blank diagram or a template. Only one diagram exists
 * at a time, so replacing one with content asks first (and offers a JSON
 * backup); the replacement itself is also undoable, like Open.
 */
export function TemplatePicker() {
  const close = useStencilStore((s) => s.closeDialog)
  const actions = useCanvasActions()
  const [category, setCategory] = useState<string | null>(null)
  const [pending, setPending] = useState<{ name: string; make: () => Diagram } | null>(null)
  const current = useDiagramStore((s) => s.diagram)

  const start = (name: string, make: () => Diagram) => {
    if (hasContent(useDiagramStore.getState().diagram) && !pending) return setPending({ name, make })
    actions.load(make())
    close()
    useUiStore.getState().notify(name === 'Blank diagram' ? 'Started a new diagram. Undo to go back.' : `Started from “${name}”. Undo to go back.`)
  }
  const pick = (t: Template) => start(t.name, () => diagramFromTemplate(t))

  if (pending) {
    return (
      <Dialog
        title="Replace the current diagram?"
        onClose={() => setPending(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPending(null)}>
              Back
            </Button>
            <Button onClick={() => void saveJson()}>
              <Download />
              Save as JSON first
            </Button>
            <Button variant="primary" data-autofocus="" onClick={() => start(pending.name, pending.make)}>
              Replace
            </Button>
          </>
        }
      >
        <p className="text-sm">
          Chalkline keeps one diagram at a time. Starting “{pending.name}” replaces “{current.meta.title}”.
        </p>
        <p className="text-sm text-text-muted">You can undo straight afterwards, or save the current diagram as JSON first to keep a copy.</p>
      </Dialog>
    )
  }

  const shown = TEMPLATES.filter((t) => !category || t.category === category)
  const card = 'flex min-h-touch flex-col gap-2 rounded-md border border-border bg-surface p-2 text-left transition-colors hover:bg-surface-muted active:bg-accent-subtle'
  return (
    <Dialog title="New diagram" onClose={close} wide>
      <h3 className="text-xs font-semibold tracking-wide text-text-muted uppercase">Start from a template</h3>
      <CategoryChips categories={CATEGORIES} value={category} onChange={setCategory} />
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        {!category && (
          <button type="button" className={card} onClick={() => start('Blank diagram', () => createEmptyDiagram())} data-autofocus="">
            <span className="flex h-(--cl-template-thumb-height) w-full items-center justify-center rounded-sm border border-dashed border-border-strong text-text-muted">
              <FilePlus className="size-7" aria-hidden="true" />
            </span>
            <span className="text-sm font-medium">Blank diagram</span>
          </button>
        )}
        {shown.map((t) => (
          <button key={t.id} type="button" className={card} onClick={() => pick(t)} aria-label={`${t.name}. ${t.description}`}>
            <Thumbnail svg={builtinThumbnail(t.id)} className="h-(--cl-template-thumb-height) w-full" />
            <span className="text-sm leading-tight font-medium">{t.name}</span>
            <span className="text-xs leading-tight text-text-muted">{t.description}</span>
          </button>
        ))}
      </div>
    </Dialog>
  )
}
