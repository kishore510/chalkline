import { CircleHelp, Download, EyeOff, FileImage, FilePlus, FileText, FolderOpen, Info, Menu, PenTool, Search, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useCanvasActions } from '@/canvas/useCanvasActions'
import { Button } from '@/components/ui/button'
import { Panel } from '@/components/ui/panel'
import { loadSample } from '@/fixtures/load'
import type { Layout } from '@/hooks/useMediaQuery'
import { UnseenDot } from '@/help/HelpEntry'
import { useHelpStore } from '@/help/helpStore'
import { useSearchStore } from '@/search/searchStore'
import { cn } from '@/lib/utils'
import { serializeDiagram, fileNameFor } from '@/persistence/serialize'
import { safeParseDiagram } from '@/schema/diagram'
import { useStencilStore } from '@/stencils/stencilStore'
import { useDiagramStore } from '@/store/diagramStore'
import { useUiStore } from '@/store/uiStore'
import { ViewOptions } from './ViewMenu'

const notify = (text: string) => useUiStore.getState().notify(text)

/** Downloads the diagram as canonical JSON (the backup and sharing format). */
export async function saveJson() {
  const { downloadBlob } = await import('@/export/browser')
  const { diagram } = useDiagramStore.getState()
  downloadBlob(new Blob([serializeDiagram(diagram)], { type: 'application/json' }), fileNameFor(diagram.meta.title, 'json'))
}

/** Exports what's visible, unless `includeHidden` asks for hidden layers too. */
export async function exportAs(format: 'svg' | 'png' | 'pdf', includeHidden = false) {
  try {
    // Loaded on demand: export code isn't needed until someone exports.
    const { exportDiagram } = await import('@/export/browser')
    await exportDiagram(useDiagramStore.getState().diagram, format, { includeHidden })
  } catch {
    notify(`Couldn't export as ${format.toUpperCase()}. Try SVG, or a different browser.`)
  }
}

function Item({ icon, children, onClick, hint, pressed }: { icon: ReactNode; children: ReactNode; onClick: () => void; hint?: string; pressed?: boolean }) {
  return (
    <Button role={pressed === undefined ? 'menuitem' : 'menuitemcheckbox'} aria-checked={pressed} variant="ghost" className="justify-start" onClick={onClick}>
      {icon}
      <span className="flex-1 text-left">{children}</span>
      {hint && <span className="text-xs text-text-muted">{hint}</span>}
      {pressed !== undefined && <span className={cn('text-xs', pressed ? 'text-accent' : 'text-text-muted')}>{pressed ? 'On' : 'Off'}</span>}
    </Button>
  )
}

const Divider = () => <div role="separator" className="my-1 h-px bg-border" />

function SaveStatusLine() {
  const status = useUiStore((s) => s.saveStatus)
  if (status === 'off') return null
  return (
    <p className={cn('px-3 pt-1 pb-2 text-xs', status === 'error' ? 'text-danger' : 'text-text-muted')}>
      {status === 'saved'
        ? 'Changes are saved in this browser. Use Save as JSON to keep a copy.'
        : 'Couldn’t save in this browser (storage full or blocked). Use Save as JSON.'}
    </p>
  )
}

/** File and export commands, in a menu off the top bar. */
export function FileMenu({ layout }: { layout: Layout }) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const actions = useCanvasActions()
  const anyHidden = useDiagramStore((s) => s.diagram.layers.some((l) => !l.visible))
  const [includeHidden, setIncludeHidden] = useState(false)
  // Phone: help lives in this menu, so the "what's new" dot shows on its button.
  const unseen = useHelpStore((s) => s.unseen) && layout === 'phone'
  const openHelp = useHelpStore((s) => s.openHelp)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node
      if (!menuRef.current?.contains(target) && !buttonRef.current?.contains(target)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      buttonRef.current?.focus()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown)
    menuRef.current?.querySelector<HTMLElement>('[role^="menuitem"]')?.focus()
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const run = (action: () => void) => () => {
    setOpen(false)
    action()
  }

  const openFile = async (file: File) => {
    try {
      const result = safeParseDiagram(JSON.parse(await file.text()))
      if (!result.success) throw result.error
      // Loading is undoable, so there's no "are you sure?" step.
      actions.load(result.data)
      notify(`Opened “${result.data.meta.title}”. Undo to go back.`)
    } catch (error) {
      const newer = error instanceof Error && error.message.includes('newer schema')
      notify(newer ? 'That diagram was made by a newer version of Chalkline.' : 'That file isn’t a Chalkline diagram.')
    }
  }

  return (
    <div className="relative">
      <Button
        ref={buttonRef}
        variant="ghost"
        size="icon"
        aria-label={unseen ? 'File menu (new: what’s changed in help)' : 'File menu'}
        aria-haspopup="menu"
        aria-expanded={open}
        title="File"
        onClick={() => setOpen((v) => !v)}
        className="relative"
      >
        <Menu />
        {unseen && <UnseenDot className="top-2.5 right-2.5" />}
      </Button>
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) void openFile(file)
        }}
      />
      {open && (
        <Panel ref={menuRef} role="menu" aria-label="File" className="absolute top-full right-0 z-40 mt-1 flex max-h-(--cl-drawer-max-height) w-72 flex-col overflow-y-auto p-1 shadow-lg">
          <Item icon={<FilePlus />} onClick={run(() => useStencilStore.getState().openDialog({ kind: 'templates' }))}>
            New diagram…
          </Item>
          <Item icon={<FolderOpen />} onClick={run(() => fileRef.current?.click())}>
            Open JSON…
          </Item>
          <Item icon={<Download />} hint={layout === 'desktop' ? 'Ctrl S' : undefined} onClick={run(() => void saveJson())}>
            Save as JSON
          </Item>
          <Divider />
          <Item icon={<FileImage />} onClick={run(() => void exportAs('png', includeHidden))}>
            Export PNG
          </Item>
          <Item icon={<PenTool />} onClick={run(() => void exportAs('svg', includeHidden))}>
            Export SVG
          </Item>
          <Item icon={<FileText />} onClick={run(() => void exportAs('pdf', includeHidden))}>
            Export PDF
          </Item>
          {anyHidden && (
            <Item icon={<EyeOff />} pressed={includeHidden} onClick={() => setIncludeHidden((v) => !v)}>
              Include hidden layers
            </Item>
          )}
          <Divider />
          {layout === 'phone' && (
            <>
              <Item icon={<Search />} onClick={run(() => useSearchStore.getState().openSearch())}>
                Find in diagram
              </Item>
              <Divider />
              <section aria-label="View">
                <h3 className="px-3 pt-2 text-xs font-semibold tracking-wide text-text-muted uppercase">View</h3>
                <ViewOptions layout={layout} />
              </section>
              <Divider />
            </>
          )}
          <Item icon={<Sparkles />} onClick={run(() => void loadSample('web-architecture').then((d) => d && actions.load(d)))}>
            Load example
          </Item>
          {layout === 'phone' && (
            <>
              <Divider />
              <Item icon={<CircleHelp />} hint={unseen ? 'New' : undefined} onClick={run(() => openHelp())}>
                Help and what’s new
              </Item>
              <Item icon={<Info />} onClick={run(() => openHelp({ kind: 'about' }))}>
                About Chalkline
              </Item>
            </>
          )}
          <SaveStatusLine />
        </Panel>
      )}
    </div>
  )
}
