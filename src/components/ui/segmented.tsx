import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Button } from './button'

export interface SegmentedOption<T extends string> {
  value: T
  label: string
  icon: ReactNode
}

/** A row of mutually exclusive icon toggles, e.g. the select / pan tool switch. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
  label,
}: {
  options: SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  className?: string
  label: string
}) {
  return (
    <div role="group" aria-label={label} className={cn('inline-flex gap-1 rounded-md bg-surface-muted p-1', className)}>
      {options.map((option) => (
        <Button
          key={option.value}
          variant="ghost"
          size="icon"
          aria-label={option.label}
          title={option.label}
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
          className="aria-pressed:bg-surface aria-pressed:shadow-sm"
        >
          {option.icon}
        </Button>
      ))}
    </div>
  )
}
