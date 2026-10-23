import { type ReactNode } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { colors, typeColors, type TypeKey } from '@stylify/shared/brand'
import { cn } from '@/lib/utils'

export function TypeChip({
  type,
  selected,
  onClick,
  children,
  index = 0,
}: {
  type: TypeKey
  selected: boolean
  onClick: () => void
  children: ReactNode
  index?: number
}) {
  const reduce = useReducedMotion()
  const { bg, fg } = typeColors[type]
  return (
    <motion.button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      initial={reduce ? false : { scale: 0.4, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={
        reduce
          ? { duration: 0 }
          : { type: 'spring', stiffness: 380, damping: 14, delay: index * 0.06 }
      }
      style={
        selected
          ? { backgroundColor: bg, color: fg, boxShadow: `0 4px 0 0 ${fg}` }
          : { backgroundColor: colors.white, color: colors.ink, boxShadow: `0 4px 0 0 ${colors.line}` }
      }
      className={cn(
        'rounded-2xl px-4 py-2 text-sm font-extrabold',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral focus-visible:ring-offset-2 focus-visible:ring-offset-cream',
      )}
    >
      {children}
    </motion.button>
  )
}
