import { Logo, LogoMark } from '@/components/Logo'
import { ThemeToggle } from '@/components/ThemeToggle'
import type { Layout } from '@/hooks/useMediaQuery'
import { HelpButton } from '@/help/HelpEntry'
import { SearchButton } from '@/search/SearchPanel'
import { FileMenu } from './FileMenu'
import { LayersButton } from './LayersPanel'
import { TidyMenu } from './TidyMenu'
import { CanvasToolbar, HistoryButtons } from './Toolbar'

export function TopBar({ layout }: { layout: Layout }) {
  return (
    <header className="cl-safe-top z-30 shrink-0 border-b border-border bg-surface">
      <div className="cl-safe-x flex h-header items-center justify-between gap-4">
        {layout === 'phone' ? (
          // Phone: the logo mark only, with undo/redo in thumb reach of the top corner.
          <div className="flex items-center gap-1">
            <LogoMark className="mr-1" />
            <HistoryButtons />
            <TidyMenu layout={layout} />
            <LayersButton layout={layout} />
          </div>
        ) : (
          <Logo />
        )}
        {layout === 'desktop' && <CanvasToolbar layout={layout} />}
        <div className="flex items-center gap-1">
          {/* Phone: no room at 360px, so find, help and About live in the file menu. */}
          {layout !== 'phone' && <SearchButton />}
          <FileMenu layout={layout} />
          {layout !== 'phone' && <HelpButton />}
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
