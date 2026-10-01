import { AlignCenter, AlignLeft, AlignRight, Bold, Check, ChevronDown, Italic, Strikethrough, Underline } from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { cssFamily, DEFAULT_FONT_ID, FONTS, getFont, isKnownFont, type TextStyleFields } from '@/fonts/registry'
import { cn } from '@/lib/utils'
import type { TextAlign, TextDefaults } from '@/schema/diagram'
import { MIXED, Section, SelectField, type Option, type Shared } from './fields'
import { textControlsState, togglePatch, type FaceAvailability, type Toggle, type ToggleKind } from './textStyle'

/*
 * Text styling for shapes and connectors (one or many): font, size, bold,
 * italic, underline, strikethrough and, for shapes, alignment. Every change
 * applies to the whole selection as one undo step.
 */

export const FONT_SIZES: Option<number>[] = [10, 12, 14, 16, 18, 20, 24, 32, 48].map((px) => ({ value: px, label: `${px} px` }))

const fieldLabel = 'text-sm font-medium text-text'

/**
 * Font picker. Each option is shown in its own font. `allowDefault`: offer
 * "Default", meaning the diagram's (or app's) font; `defaultFont` names it.
 */
export function FontPicker({ value, onChange, defaultFont, label = 'Font' }: { value: Shared<string>; onChange: (id: string | undefined) => void; defaultFont: string; label?: string }) {
  const [open, setOpen] = useState(false)
  const labelId = useId()
  const valueId = useId()
  const listId = useId()
  const effective = value === MIXED ? undefined : getFont(value ?? defaultFont)
  const current =
    value === MIXED ? 'Mixed' : value === undefined ? `Default (${getFont(defaultFont).label})` : isKnownFont(value) ? getFont(value).label : `Unknown font (shown as ${getFont(value).label})`
  const pick = (id: string | undefined) => {
    onChange(id)
    setOpen(false)
  }
  const option = (id: string | undefined, title: string, detail: string, family: string) => {
    const checked = value === id
    return (
      <button
        key={id ?? 'default'}
        type="button"
        role="radio"
        aria-checked={checked}
        onClick={() => pick(id)}
        className={cn('flex min-h-touch w-full items-center gap-2 rounded-md px-2 text-left hover:bg-surface-muted', checked && 'bg-accent-subtle')}
      >
        <span className="min-w-0 flex-1 truncate text-base" style={{ fontFamily: family }}>
          {title}
        </span>
        <span className="shrink-0 text-xs text-text-muted">{detail}</span>
        <Check aria-hidden="true" className={cn('size-4 shrink-0 text-accent', !checked && 'invisible')} />
      </button>
    )
  }
  return (
    <div className="flex flex-col gap-1.5">
      <span id={labelId} className={fieldLabel}>
        {label}
      </span>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        aria-labelledby={`${labelId} ${valueId}`}
        onClick={() => setOpen((v) => !v)}
        className="flex h-touch w-full min-w-0 items-center gap-2 rounded-md border border-border-strong bg-surface px-3 text-left text-base text-text transition-colors focus-visible:border-focus"
      >
        <span id={valueId} className="min-w-0 flex-1 truncate" style={effective ? { fontFamily: cssFamily(effective) } : undefined}>
          {current}
        </span>
        <ChevronDown aria-hidden="true" className={cn('size-4 shrink-0 text-text-muted transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div id={listId} role="radiogroup" aria-labelledby={labelId} className="flex flex-col rounded-md border border-border p-1">
          {option(undefined, 'Default', getFont(defaultFont).label, cssFamily(getFont(defaultFont)))}
          {FONTS.map((f) => option(f.id, f.label, f.kind, cssFamily(f)))}
        </div>
      )}
      {effective?.note && <p className="text-xs text-text-muted">{effective.note}</p>}
    </div>
  )
}

function ToggleButton({
  label,
  icon,
  value,
  available,
  onPress,
}: {
  label: string
  icon: ReactNode
  value: Toggle
  available: FaceAvailability
  onPress: () => void
}) {
  const missing = available === 'none'
  const title = missing ? `${label}: not available in this font` : label
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={title}
      title={title}
      aria-pressed={value === MIXED ? 'mixed' : value}
      disabled={missing}
      onClick={onPress}
      className={cn(value === MIXED && 'border border-dashed border-accent')}
    >
      {icon}
    </Button>
  )
}

const ALIGNMENTS: { value: TextAlign; label: string; icon: ReactNode }[] = [
  { value: 'left', label: 'Align left', icon: <AlignLeft /> },
  { value: 'center', label: 'Align centre', icon: <AlignCenter /> },
  { value: 'right', label: 'Align right', icon: <AlignRight /> },
]

export function TextSection({
  styles,
  defaults,
  alignment,
  onPatch,
}: {
  styles: TextStyleFields[]
  defaults: TextDefaults | undefined
  /** Shapes only: connector labels are one line. */
  alignment: boolean
  onPatch: (patch: Partial<Record<keyof TextStyleFields, unknown>>) => void
}) {
  const state = textControlsState(styles, defaults)
  const defaultFont = defaults?.fontFamily ?? DEFAULT_FONT_ID
  const press = (kind: ToggleKind, value: Toggle) => onPatch(togglePatch(kind, value))
  const missing = [state.available.bold === 'none' && 'Bold', state.available.italic === 'none' && 'Italic'].filter(Boolean)
  const align = state.textAlign === undefined ? 'center' : state.textAlign
  return (
    <Section title="Text">
      <FontPicker value={state.fontFamily} defaultFont={defaultFont} onChange={(fontFamily) => onPatch({ fontFamily })} />
      <SelectField label="Size" value={state.fontSize} options={FONT_SIZES} onChange={(fontSize) => onPatch({ fontSize })} />
      <div className="flex flex-col gap-1.5">
        <div role="group" aria-label="Text style" className="flex flex-wrap items-center gap-1">
          <ToggleButton label="Bold" icon={<Bold />} value={state.bold} available={state.available.bold} onPress={() => press('bold', state.bold)} />
          <ToggleButton label="Italic" icon={<Italic />} value={state.italic} available={state.available.italic} onPress={() => press('italic', state.italic)} />
          <ToggleButton label="Underline" icon={<Underline />} value={state.underline} available="all" onPress={() => press('underline', state.underline)} />
          <ToggleButton label="Strikethrough" icon={<Strikethrough />} value={state.strike} available="all" onPress={() => press('strike', state.strike)} />
          {alignment && (
            <>
              <div aria-hidden="true" className="mx-1 h-6 w-px bg-border" />
              <div role="radiogroup" aria-label="Alignment" className="flex gap-1">
                {ALIGNMENTS.map((a) => (
                  <Button
                    key={a.value}
                    variant="ghost"
                    size="icon"
                    role="radio"
                    aria-checked={align === a.value}
                    className={cn(align === a.value && 'bg-accent-subtle text-accent')}
                    aria-label={a.label}
                    title={a.label}
                    // Centre is the default, so choosing it clears the field.
                    onClick={() => onPatch({ textAlign: a.value === 'center' ? undefined : a.value })}
                  >
                    {a.icon}
                  </Button>
                ))}
              </div>
            </>
          )}
        </div>
        {missing.length > 0 && <p className="text-xs text-text-muted">{missing.join(' and ')}: not available in this font.</p>}
        {state.available.italic === 'some' && <p className="text-xs text-text-muted">Some of these fonts have no italic; those labels stay upright.</p>}
      </div>
    </Section>
  )
}

/** Nothing selected: the diagram's own font and size, used by every label that doesn't set its own. */
export function TextDefaultsSection({ defaults, onPatch }: { defaults: TextDefaults | undefined; onPatch: (patch: Partial<TextDefaults> & Record<string, unknown>) => void }) {
  return (
    <Section title="Text defaults">
      <FontPicker label="Font" value={defaults?.fontFamily} defaultFont={DEFAULT_FONT_ID} onChange={(fontFamily) => onPatch({ fontFamily })} />
      <SelectField label="Shape label size" value={defaults?.fontSize} options={FONT_SIZES} onChange={(fontSize) => onPatch({ fontSize })} />
      <p className="text-xs text-text-muted">Shapes, connectors and group titles use these unless they have their own. Connector labels keep their smaller size.</p>
    </Section>
  )
}
