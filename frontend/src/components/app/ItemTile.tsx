import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { motion, useReducedMotion } from 'framer-motion'
import { TYPE_NAMES, typeColors, typeKey } from '@stylify/shared/brand'
import { Garment } from '@/components/brand/Garment'
import type { Item } from '@/lib/api'

export function ItemTile({ item, index }: { item: Item; index: number }) {
  const reduce = useReducedMotion()
  const [broken, setBroken] = useState(false)
  const key = typeKey(item.type)
  const { bg, fg } = typeColors[key]
  const showPhoto = !!item.imageUrl && !broken
  const details = [TYPE_NAMES[key], item.size, item.color].filter(Boolean).join(' · ')

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={reduce ? undefined : { y: -2 }}
      transition={{ duration: reduce ? 0 : 0.3, delay: reduce ? 0 : Math.min(index * 0.04, 0.4) }}
    >
      <Link
        to="/edit-item/$id"
        params={{ id: String(item.id) }}
        className="block rounded-3xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
      >
        <div
          className="relative flex aspect-square items-center justify-center overflow-hidden rounded-3xl"
          style={{ backgroundColor: bg, color: fg, boxShadow: `0 5px 0 0 ${fg}33` }}
        >
          {showPhoto ? (
            <img
              src={item.imageUrl}
              alt={item.name ?? ''}
              className="h-full w-full object-cover"
              onError={() => setBroken(true)}
            />
          ) : (
            <Garment kind={key} className="h-1/2 w-1/2" />
          )}
        </div>
        <p className="mt-3 truncate px-1 text-base font-extrabold text-ink">{item.name}</p>
        <p className="truncate px-1 text-sm text-muted">{details}</p>
      </Link>
    </motion.div>
  )
}

export function ItemTileSkeleton() {
  return (
    <div aria-hidden="true">
      <div className="aspect-square animate-pulse rounded-3xl bg-line" />
      <div className="mt-3 h-4 w-3/4 animate-pulse rounded-full bg-line" />
      <div className="mt-2 h-3 w-1/2 animate-pulse rounded-full bg-line" />
    </div>
  )
}
