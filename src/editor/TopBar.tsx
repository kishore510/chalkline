import { Logo } from '@/components/Logo'
import { ThemeToggle } from '@/components/ThemeToggle'
import type { Layout } from '@/hooks/useMediaQuery'
import { CanvasToolbar, SnapButton } from './Toolbar'

export function TopBar({ layout }: { layout: Layout }) {
  return (
    <header className="cl-safe-top z-10 shrink-0 border-b border-border bg-surface">
      <div className="cl-safe-x flex h-header items-center justify-between gap-4">
        <Logo />
        {layout === 'desktop' && <CanvasToolbar layout={layout} />}
        <div className="flex items-center gap-1">
          {/* The phone toolbar is kept short; snap lives up here instead. */}
          {layout === 'phone' && <SnapButton />}
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
