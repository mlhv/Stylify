import { type ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function Pill({
  selected,
  onClick,
  children,
}: {
  selected: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        'rounded-full px-4 py-2 text-sm font-extrabold transition-[transform,box-shadow] duration-75',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral focus-visible:ring-offset-2 focus-visible:ring-offset-cream',
        'active:translate-y-1 active:shadow-none',
        selected
          ? 'bg-ink text-white shadow-[0_4px_0_0_#000]'
          : 'bg-white text-ink shadow-[0_4px_0_0_theme(colors.line)]',
      )}
    >
      {children}
    </button>
  )
}
