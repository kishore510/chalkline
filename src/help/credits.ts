import type { Credit } from '@/build/buildInfo'

/*
 * Open-source credits, generated at build time from package metadata
 * (vite.config.ts). Imported only by the lazily loaded About page.
 */

export const CREDITS: Credit[] = typeof __APP_CREDITS__ === 'undefined' ? [] : __APP_CREDITS__

/** Packages called out by name in About, with what they do. The full list follows them. */
export const HIGHLIGHTS: { name: string; title: string; role: string }[] = [
  { name: '@xyflow/react', title: 'React Flow', role: 'The canvas: panning, zooming, shapes and connectors.' },
  { name: '@fontsource-variable/inter', title: 'Inter', role: 'The typeface, by Rasmus Andersson, bundled with the app.' },
  { name: '@fontsource-variable/source-serif-4', title: 'Source Serif 4', role: 'A label font (serif). SIL Open Font License.' },
  { name: '@fontsource-variable/jetbrains-mono', title: 'JetBrains Mono', role: 'A label font (monospace). SIL Open Font License.' },
  { name: '@fontsource-variable/caveat', title: 'Caveat', role: 'A label font (handwritten). SIL Open Font License.' },
  { name: '@fontsource-variable/nunito', title: 'Nunito', role: 'A label font (rounded). SIL Open Font License.' },
  { name: 'lucide-react', title: 'Lucide', role: 'The icons.' },
  { name: 'elkjs', title: 'ELK', role: 'Auto-arrange layout.' },
  { name: 'react', title: 'React', role: 'The user interface.' },
  { name: 'zustand', title: 'Zustand', role: 'Editor state.' },
  { name: 'zod', title: 'Zod', role: 'Checking diagram files.' },
]

export const creditFor = (name: string) => CREDITS.find((c) => c.name === name)
