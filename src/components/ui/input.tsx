import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

// text-base (16px) stops iOS Safari zooming the page when the input is focused.
export function Input({ className, ...props }: ComponentProps<'input'>) {
  return (
    <input
      className={cn(
        'h-touch w-full min-w-0 rounded-md border border-border-strong bg-surface px-3 text-base text-text',
        'placeholder:text-text-muted transition-colors focus-visible:border-focus',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}

export function Label({ className, ...props }: ComponentProps<'label'>) {
  return <label className={cn('flex flex-col gap-1.5 text-sm font-medium text-text', className)} {...props} />
}
