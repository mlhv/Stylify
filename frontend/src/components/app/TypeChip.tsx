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
  const look = selected
    ? { backgroundColor: bg, color: fg, edge: fg }
    : { backgroundColor: colors.white, color: '#8a6f5c', edge: colors.line }
  const raised = `0 4px 0 0 ${look.edge}`
  const pressed = `0 0px 0 0 ${look.edge}`
  return (
    <motion.button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      initial={reduce ? false : { scale: 0.4, opacity: 0, y: 0, boxShadow: raised }}
      animate={{ scale: 1, opacity: 1, y: 0, boxShadow: raised }}
      // Press: sink by the 4 px edge in ~80 ms, the same as the other pressables.
      whileTap={{ y: 4, boxShadow: pressed }}
      transition={{
        default: reduce
          ? { duration: 0 }
          : { type: 'spring', stiffness: 380, damping: 14, delay: index * 0.06 },
        y: { duration: 0.08 },
        boxShadow: { duration: 0.08 },
      }}
      style={{ backgroundColor: look.backgroundColor, color: look.color, borderColor: look.edge }}
      className={cn(
        'rounded-[14px] border-2 px-3.5 py-1.5 text-[13px] font-extrabold',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral focus-visible:ring-offset-2 focus-visible:ring-offset-cream',
      )}
    >
      {children}
    </motion.button>
  )
}
