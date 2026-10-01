import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Mutually exclusive text choices, e.g. the theme. `stacked` puts long
 * labels one per row, so they wrap instead of being cut off at large text sizes.
 */
export function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
  stacked = false,
}: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
  stacked?: boolean
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-text">{label}</span>
      <div className={cn('flex gap-1', stacked && 'flex-col')}>
        {options.map((o) => (
          <Button
            key={o.value}
            variant="secondary"
            aria-pressed={o.value === value}
            onClick={() => onChange(o.value)}
            className={cn(
              'min-w-0 flex-1 px-2 aria-pressed:border-accent aria-pressed:bg-accent-subtle aria-pressed:text-accent',
              stacked && 'h-auto min-h-touch justify-start px-3 py-2 text-left whitespace-normal',
            )}
          >
            {o.label}
          </Button>
        ))}
      </div>
    </div>
  )
}
