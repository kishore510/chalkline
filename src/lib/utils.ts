import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

// Teach tailwind-merge about our custom font size, otherwise it treats
// `text-node` as a colour and drops it when merged with `text-node-text`.
const twMerge = extendTailwindMerge({
  extend: { theme: { text: ['node'] } },
})

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
