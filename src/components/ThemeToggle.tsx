import { Monitor, Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTheme } from '@/hooks/useTheme'

const ICONS = { system: Monitor, light: Sun, dark: Moon }
const LABELS = { system: 'System theme', light: 'Light theme', dark: 'Dark theme' }

export function ThemeToggle() {
  const { preference, cycle } = useTheme()
  const Icon = ICONS[preference]
  return (
    <Button variant="ghost" size="icon" onClick={cycle} aria-label={`${LABELS[preference]} (tap to change)`} title={LABELS[preference]}>
      <Icon />
    </Button>
  )
}
