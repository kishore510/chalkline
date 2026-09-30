import { Logo, LogoMark } from '@/components/Logo'
import { ThemeToggle } from '@/components/ThemeToggle'
import type { Layout } from '@/hooks/useMediaQuery'
import { FileMenu } from './FileMenu'
import { CanvasToolbar, HistoryButtons } from './Toolbar'

export function TopBar({ layout }: { layout: Layout }) {
  return (
    <header className="cl-safe-top z-10 shrink-0 border-b border-border bg-surface">
      <div className="cl-safe-x flex h-header items-center justify-between gap-4">
        {layout === 'phone' ? (
          // Phone: the logo mark only, with undo/redo in thumb reach of the top corner.
          <div className="flex items-center gap-1">
            <LogoMark className="mr-1" />
            <HistoryButtons />
          </div>
        ) : (
          <Logo />
        )}
        {layout === 'desktop' && <CanvasToolbar layout={layout} />}
        <div className="flex items-center gap-1">
          <FileMenu layout={layout} />
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
