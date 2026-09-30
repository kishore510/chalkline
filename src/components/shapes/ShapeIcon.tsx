import { getShape } from '@/shapes/registry'
import { cn } from '@/lib/utils'

/** Palette glyph for a shape, from the registry. */
export function ShapeIcon({ type, className }: { type: string; className?: string }) {
  const Icon = getShape(type).icon
  return <Icon className={cn('size-6', className)} aria-hidden="true" />
}
