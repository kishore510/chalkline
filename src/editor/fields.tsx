import { Check, Pipette } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import { COLOUR_PRESETS, normaliseHex, PRESET_NAMES, presetToken, resolveColour, type PresetVariant } from '@/lib/colour'
import { cn } from '@/lib/utils'

/** A value shared by every selected item, `undefined` for "theme default", or MIXED when they differ. */
export const MIXED = Symbol('mixed')
export type Shared<T> = T | undefined | typeof MIXED

export function shared<T, V>(items: T[], get: (item: T) => V): Shared<V> {
  if (items.length === 0) return undefined
  const first = get(items[0]!)
  return items.every((item) => get(item) === first) ? first : MIXED
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-t border-border pt-4">
      <h3 className="text-xs font-semibold tracking-wide text-text-muted uppercase">{title}</h3>
      {children}
    </section>
  )
}

const fieldLabel = 'flex flex-col gap-1.5 text-sm font-medium text-text'
const control =
  'h-touch w-full min-w-0 rounded-md border border-border-strong bg-surface px-3 text-base text-text transition-colors focus-visible:border-focus'

export function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
  rows = 2,
  hint,
  inputRef,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  rows?: number
  hint?: string
  inputRef?: React.Ref<HTMLTextAreaElement>
}) {
  return (
    <label className={fieldLabel}>
      {label}
      <textarea
        ref={inputRef}
        value={value}
        rows={rows}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={cn(control, 'h-auto min-h-touch resize-y py-2.5 placeholder:text-text-muted')}
      />
      {hint && <span className="text-xs font-normal text-text-muted">{hint}</span>}
    </label>
  )
}

export interface Option<T> {
  value: T
  label: string
}

const DEFAULT_KEY = '__default'
const MIXED_KEY = '__mixed'

/** Native select (best on touch). `undefined` is the theme default. */
export function SelectField<T extends string | number>({
  label,
  value,
  options,
  onChange,
  defaultLabel = 'Default',
}: {
  label: string
  value: Shared<T>
  options: Option<T>[]
  onChange: (value: T | undefined) => void
  defaultLabel?: string
}) {
  const key = value === MIXED ? MIXED_KEY : value === undefined ? DEFAULT_KEY : String(value)
  return (
    <label className={cn(fieldLabel, 'min-w-0 flex-1')}>
      {label}
      <select
        value={key}
        onChange={(e) => {
          if (e.target.value === DEFAULT_KEY) return onChange(undefined)
          const option = options.find((o) => String(o.value) === e.target.value)
          if (option) onChange(option.value)
        }}
        className={control}
      >
        {value === MIXED && (
          <option value={MIXED_KEY} disabled>
            Mixed
          </option>
        )}
        <option value={DEFAULT_KEY}>{defaultLabel}</option>
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function Swatch({
  label,
  colour,
  pressed,
  onClick,
  children,
}: {
  label: string
  colour?: string
  pressed: boolean
  onClick?: () => void
  children?: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      onClick={onClick}
      className="flex size-touch items-center justify-center rounded-md transition-colors hover:bg-surface-muted aria-pressed:bg-accent-subtle"
    >
      <span
        className="flex size-7 items-center justify-center rounded-full border border-border-strong text-text"
        style={colour ? { background: colour } : undefined}
      >
        {pressed && !children && <Check className="size-4 text-accent" strokeWidth={3} />}
        {children}
      </span>
    </button>
  )
}

/**
 * Theme-aware colour presets plus a custom colour. Presets store token
 * references, so they adapt to light and dark; custom colours store hex.
 */
export function ColourField({
  label,
  value,
  onChange,
  variant,
  defaultColour,
}: {
  label: string
  value: Shared<string>
  onChange: (value: string | undefined) => void
  variant: PresetVariant
  /** CSS value of the theme default, shown on the "Default" swatch. */
  defaultColour: string
}) {
  const id = useId()
  const isCustom = typeof value === 'string' && !value.startsWith('token:')
  const current =
    value === MIXED
      ? 'Mixed'
      : value === undefined
        ? 'Default'
        : isCustom
          ? value
          : (COLOUR_PRESETS.find((p) => presetToken(p, variant) === value) ?? 'Custom')
  return (
    <div role="group" aria-labelledby={id} className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span id={id} className="font-medium text-text">
          {label}
        </span>
        <span className="truncate text-xs text-text-muted">{current in PRESET_NAMES ? PRESET_NAMES[current as keyof typeof PRESET_NAMES] : current}</span>
      </div>
      <div className="grid grid-cols-5 gap-1">
        <Swatch label="Default" colour={defaultColour} pressed={value === undefined} onClick={() => onChange(undefined)} />
        {COLOUR_PRESETS.map((preset) => {
          const token = presetToken(preset, variant)
          return (
            <Swatch
              key={preset}
              label={PRESET_NAMES[preset]}
              colour={resolveColour(token, defaultColour)}
              pressed={value === token}
              onClick={() => onChange(token)}
            />
          )
        })}
        <label
          title="Custom colour"
          className="relative flex size-touch cursor-pointer items-center justify-center rounded-md transition-colors hover:bg-surface-muted has-focus-visible:outline-2 has-focus-visible:outline-focus"
        >
          <span
            className={cn(
              'flex size-7 items-center justify-center rounded-full border border-border-strong text-text-muted',
              isCustom && 'text-text',
            )}
            style={isCustom ? { background: value } : undefined}
          >
            {!isCustom && <Pipette className="size-4" />}
          </span>
          <input
            // Uncontrolled: the browser's own default applies until a custom colour is chosen.
            key={isCustom ? 'custom' : 'preset'}
            type="color"
            aria-label={`Custom ${label.toLowerCase()} colour`}
            defaultValue={isCustom ? value : undefined}
            onChange={(e) => {
              const hex = normaliseHex(e.target.value)
              if (hex) onChange(hex)
            }}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </label>
      </div>
    </div>
  )
}

export function ToggleField({ label, pressed, onChange }: { label: string; pressed: Shared<boolean>; onChange: (value: boolean) => void }) {
  const on = pressed === true
  return (
    <label className="flex min-h-touch cursor-pointer items-center justify-between gap-3 text-sm font-medium text-text">
      {label}
      <button
        type="button"
        role="switch"
        aria-checked={pressed === MIXED ? 'mixed' : on}
        onClick={() => onChange(!on)}
        className={cn(
          'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors',
          on ? 'border-accent bg-accent' : 'border-border-strong bg-surface-muted',
        )}
      >
        <span
          className={cn('inline-block size-5 rounded-full shadow-sm transition-transform', on ? 'translate-x-6 bg-on-accent' : 'translate-x-1 bg-text-muted')}
        />
      </button>
    </label>
  )
}
