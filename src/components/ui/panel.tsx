import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

/** Raised surface used for side panels, sheets, popovers and floating toolbars. */
export function Panel({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('rounded-lg border border-border bg-surface text-text shadow-md', className)} {...props} />
}

export function PanelHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex min-h-touch items-center justify-between gap-2 border-b border-border px-4', className)} {...props} />
}

export function PanelTitle({ className, ...props }: ComponentProps<'h3'>) {
  return <h3 className={cn('text-sm font-semibold', className)} {...props} />
}

export function PanelBody({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-4 p-4', className)} {...props} />
}
