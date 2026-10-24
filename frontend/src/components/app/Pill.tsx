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
        'rounded-[14px] border-2 px-3.5 py-1.5 text-[13px] font-extrabold transition-[transform,box-shadow] duration-75',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral focus-visible:ring-offset-2 focus-visible:ring-offset-cream',
        'active:translate-y-1 active:shadow-none',
        selected
          ? 'border-black bg-ink text-cream shadow-[0_4px_0_0_#000]'
          : 'border-line bg-white text-[#8a6f5c] shadow-[0_4px_0_0_theme(colors.line)]',
      )}
    >
      {children}
    </button>
  )
}
