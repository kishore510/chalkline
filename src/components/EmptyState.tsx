import type { ReactNode } from 'react'

/** Hand-drawn sketch used wherever there is nothing to show yet. */
function EmptySketch() {
  return (
    <svg viewBox="0 0 120 72" aria-hidden="true" className="h-18 w-30">
      <g fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75">
        <path className="stroke-border-strong" d="M6.5 22.4c7.6-.6 17.2-.5 24.8.2.5 7.4.4 15.4-.2 22.6-7.8.6-16.8.5-24.4-.1-.7-7.6-.8-15.2-.2-22.7Z" />
        <path
          className="stroke-border-strong"
          d="M86.4 50.8c-5.6.3-8.4-4.6-5.3-8.3-3.1-5.4 2.1-10.3 7.1-8.1 2.1-6.4 11.8-6.8 14.3-.4 5.9-1.6 10.4 3.8 7.2 8.6 3.4 3.8.3 8.9-5.2 8.4-5.9.3-12.2.2-18.1-.2Z"
        />
        <path className="stroke-accent" strokeDasharray="3 4" d="M33.8 33.6c13.4-1.8 28.2-1.3 44.6 5.1" />
        <path className="stroke-accent" d="M74.2 34.4l4.6 4.5-5.9 2.4" />
      </g>
    </svg>
  )
}

export function EmptyState({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
      <EmptySketch />
      <h3 className="text-base font-semibold text-text">{title}</h3>
      <p className="max-w-xs text-sm text-text-muted">{children}</p>
      {action}
    </div>
  )
}
