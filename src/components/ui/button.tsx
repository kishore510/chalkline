import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

export const buttonVariants = cva(
  [
    'inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap select-none',
    'transition-colors',
    'disabled:pointer-events-none disabled:opacity-50',
    '[&_svg]:pointer-events-none [&_svg]:size-5 [&_svg]:shrink-0',
  ],
  {
    variants: {
      variant: {
        primary: 'bg-accent text-on-accent shadow-sm hover:bg-accent-hover active:bg-accent-hover',
        secondary: 'border border-border bg-surface text-text shadow-sm hover:bg-surface-muted active:bg-surface-muted',
        ghost: 'text-text hover:bg-surface-muted active:bg-surface-muted',
        danger: 'bg-danger text-on-danger shadow-sm hover:opacity-90 active:opacity-90',
      },
      size: {
        default: 'h-touch px-4',
        icon: 'size-touch',
      },
    },
    compoundVariants: [
      // Toggle buttons (aria-pressed) show a clear selected state.
      { variant: 'ghost', className: 'aria-pressed:bg-accent-subtle aria-pressed:text-accent' },
    ],
    defaultVariants: { variant: 'secondary', size: 'default' },
  },
)

export type ButtonProps = ComponentProps<'button'> & VariantProps<typeof buttonVariants>

export function Button({ className, variant, size, type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
}
