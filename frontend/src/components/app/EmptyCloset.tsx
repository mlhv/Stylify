import { Link } from '@tanstack/react-router'
import { motion, useReducedMotion } from 'framer-motion'
import { Garment } from '@/components/brand/Garment'
import { chunkyClasses } from './ChunkyButton'

export function EmptyCloset() {
  const reduce = useReducedMotion()
  return (
    <div className="flex flex-col items-center px-4 py-16 text-center">
      <motion.div
        animate={reduce ? undefined : { y: [0, -10, 0] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        className="flex h-40 w-40 items-center justify-center rounded-full bg-[#ffe1d6] text-coral"
      >
        <Garment kind="hanger" className="h-20 w-20" />
      </motion.div>
      <h2 className="mt-8 text-2xl font-extrabold">It's a bit empty in here</h2>
      <p className="mt-2 max-w-xs text-muted">Snap your first piece and we'll keep track of it for you.</p>
      <Link to="/create-item" className={`${chunkyClasses('primary', 'lg')} mt-8`}>
        Add your first piece
      </Link>
    </div>
  )
}
