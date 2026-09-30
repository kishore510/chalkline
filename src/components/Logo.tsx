import { cn } from '@/lib/utils'

/** Hand-drawn mark: two chalk boxes joined by a line. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn('size-7', className)}>
      <g fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
        <path className="stroke-text" d="M4.2 5.1c2.6-.3 6.1-.2 8.6.1.3 2.4.2 5.3-.1 7.7-2.7.3-5.8.2-8.4-.1-.3-2.5-.4-5.2-.1-7.7Z" />
        <path className="stroke-text" d="M19.3 18.9c2.7-.2 5.9-.3 8.5.1.2 2.5.3 5.4-.1 7.8-2.6.2-5.7.3-8.3-.1-.3-2.6-.3-5.2-.1-7.8Z" />
        <path className="stroke-accent" d="M8.6 13.4c.4 3.4 1.5 6.4 4.3 8.2 1.6 1 3.4 1.3 5.3 1.4" />
        <path className="stroke-accent" d="M16.6 20.7l2.1 2.3-2.4 1.9" />
      </g>
    </svg>
  )
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <LogoMark />
      <span className="text-lg font-semibold tracking-tight">Chalkline</span>
    </span>
  )
}
