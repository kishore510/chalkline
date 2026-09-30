import { useMemo, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input, Label } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { BUILTIN_STENCILS } from '@/stencils/builtin'
import type { StencilContent } from '@/stencils/format'
import { describeImport, splitTags, type ClashChoice, type ImportPlan } from '@/stencils/library'
import { previewThumbnail, useStencilStore } from '@/stencils/stencilStore'
import { useUiStore } from '@/store/uiStore'
import { Thumbnail } from './Thumbnail'
import { TemplatePicker } from './TemplatePicker'

const notify = (text: string) => useUiStore.getState().notify(text)

/** Library and built-in categories, for quick picking. */
function useCategoryChoices() {
  const mine = useStencilStore((s) => s.categories)
  return useMemo(() => [...new Set([...mine, ...BUILTIN_STENCILS.map((s) => s.category)])].sort((a, b) => a.localeCompare(b)), [mine])
}

interface DetailsValues {
  name: string
  category: string
  tags: string
}

/** Name, category (existing or new) and tags. Used to save a new stencil and to edit one. */
function DetailsDialog({
  title,
  submitLabel,
  initial,
  preview,
  focus = 'name',
  onSubmit,
}: {
  title: string
  submitLabel: string
  initial: DetailsValues
  preview?: string
  focus?: 'name' | 'category'
  onSubmit: (values: DetailsValues) => Promise<void>
}) {
  const close = useStencilStore((s) => s.closeDialog)
  const categories = useCategoryChoices()
  const [values, setValues] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (patch: Partial<DetailsValues>) => setValues((v) => ({ ...v, ...patch }))

  const submit = async (e?: FormEvent) => {
    e?.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await onSubmit(values)
      close()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      title={title}
      onClose={close}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" disabled={busy} onClick={() => void submit()}>
            {submitLabel}
          </Button>
        </>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
        {preview && <Thumbnail svg={preview} className="h-(--cl-template-thumb-height) w-full" />}
        <Label>
          Name
          <Input value={values.name} maxLength={100} data-autofocus={focus === 'name' ? '' : undefined} onChange={(e) => set({ name: e.target.value })} />
        </Label>
        <Label>
          Category
          <Input
            value={values.category}
            maxLength={60}
            list="cl-stencil-categories"
            placeholder="Pick one below or type a new one"
            data-autofocus={focus === 'category' ? '' : undefined}
            onChange={(e) => set({ category: e.target.value })}
          />
        </Label>
        <datalist id="cl-stencil-categories">
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <div role="group" aria-label="Existing categories" className="-mt-2 flex flex-wrap gap-2">
          {categories.map((c) => (
            <Button
              key={c}
              variant="ghost"
              aria-pressed={values.category.trim() === c}
              className="h-auto min-h-touch rounded-full border border-border px-3 text-xs"
              onClick={() => set({ category: c })}
            >
              {c}
            </Button>
          ))}
        </div>
        <Label>
          Tags (optional)
          <Input value={values.tags} placeholder="Separate with commas" onChange={(e) => set({ tags: e.target.value })} />
        </Label>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        {/* Enter in a field submits. */}
        <button type="submit" hidden />
      </form>
    </Dialog>
  )
}

function SaveDialog({ content }: { content: StencilContent }) {
  const save = useStencilStore((s) => s.save)
  const preview = useMemo(() => previewThumbnail(content), [content])
  return (
    <DetailsDialog
      title="Save as stencil"
      submitLabel="Save"
      preview={preview}
      initial={{ name: '', category: '', tags: '' }}
      onSubmit={async (v) => {
        const r = await save({ name: v.name, category: v.category, tags: splitTags(v.tags) }, content)
        notify(`Saved “${r.stencil.name}” to My library.`)
      }}
    />
  )
}

function EditDialog({ id, focus }: { id: string; focus: 'name' | 'category' }) {
  const record = useStencilStore((s) => s.items.find((r) => r.id === id))
  const update = useStencilStore((s) => s.update)
  if (!record) return null
  const { name, category, tags } = record.stencil
  return (
    <DetailsDialog
      title="Stencil details"
      submitLabel="Save changes"
      focus={focus}
      preview={record.thumbnail}
      initial={{ name, category, tags: tags.join(', ') }}
      onSubmit={async (v) => void (await update(id, { name: v.name, category: v.category, tags: splitTags(v.tags) }))}
    />
  )
}

function ImportDialog({ plan }: { plan: ImportPlan }) {
  const close = useStencilStore((s) => s.closeDialog)
  const apply = useStencilStore((s) => s.applyImport)
  const [busy, setBusy] = useState(false)
  const n = plan.clashes.length
  const run = async (choice: ClashChoice) => {
    setBusy(true)
    try {
      notify(describeImport(await apply(plan, choice)))
      close()
    } catch (error) {
      notify((error as Error).message)
      setBusy(false)
    }
  }
  return (
    <Dialog
      title="Import stencils"
      onClose={close}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button disabled={busy} onClick={() => void run('replace')}>
            Replace
          </Button>
          <Button variant="primary" disabled={busy} data-autofocus="" onClick={() => void run('keep-both')}>
            Keep both
          </Button>
        </>
      }
    >
      <p className="text-sm">
        {n === 1 ? 'A stencil has the same name as one in your library:' : `${n} stencils have the same names as ones in your library:`}
      </p>
      <ul className={cn('flex flex-col gap-1 text-sm text-text-muted', n > 6 && 'max-h-40 overflow-y-auto')}>
        {plan.clashes.map((c) => (
          <li key={c.existing.id + c.incoming.id}>“{c.existing.stencil.name}”</li>
        ))}
      </ul>
      <p className="text-sm text-text-muted">
        Keep both adds the imported {n === 1 ? 'one' : 'ones'} with a number after the name. Replace overwrites yours.
        {plan.fresh.length > 0 && ` ${plan.fresh.length} other ${plan.fresh.length === 1 ? 'stencil is' : 'stencils are'} imported either way.`}
      </p>
    </Dialog>
  )
}

/** Whichever stencil dialog is open. Mounted once in the editor. */
export function StencilDialogs() {
  const dialog = useStencilStore((s) => s.dialog)
  if (!dialog) return null
  switch (dialog.kind) {
    case 'save':
      return <SaveDialog content={dialog.content} />
    case 'edit':
      return <EditDialog key={dialog.id} id={dialog.id} focus={dialog.focus} />
    case 'import':
      return <ImportDialog plan={dialog.plan} />
    case 'templates':
      return <TemplatePicker />
  }
}
