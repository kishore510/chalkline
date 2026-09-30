import { Button } from '@/components/ui/button'

/** "All" plus one chip per category; a horizontally scrolling row. */
export function CategoryChips({
  categories,
  value,
  onChange,
  tabIndex,
}: {
  categories: readonly string[]
  value: string | null
  onChange: (value: string | null) => void
  tabIndex?: number
}) {
  if (categories.length < 2) return null
  const chip = (label: string, selected: boolean, onClick: () => void) => (
    <Button
      key={label}
      variant="ghost"
      tabIndex={tabIndex}
      aria-pressed={selected}
      onClick={onClick}
      className="h-auto min-h-touch shrink-0 rounded-full border border-border px-3 text-xs"
    >
      {label}
    </Button>
  )
  return (
    <div role="group" aria-label="Filter by category" className="-mx-1 flex touch-pan-x gap-2 overflow-x-auto px-1 pb-1">
      {chip('All', value === null, () => onChange(null))}
      {categories.map((c) => chip(c, value === c, () => onChange(value === c ? null : c)))}
    </div>
  )
}
