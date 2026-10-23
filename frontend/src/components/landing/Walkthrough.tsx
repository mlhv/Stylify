import { useEffect, useState, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Camera, Plus } from 'lucide-react'
import { typeColors, type TypeKey } from '@stylify/shared/brand'
import { Garment } from '@/components/brand/Garment'
import { TypeChip } from '@/components/app/TypeChip'
import { chunkyClasses } from '@/components/app/ChunkyButton'
import { cn } from '@/lib/utils'

// 0 take a photo, 1 thinking, 2 the guess, 3 it lands in the closet.
type Scene = 0 | 1 | 2 | 3
const SCENE_MS = 2500
const noop = () => {}

// Pauses the loop while the tab is hidden, so it picks up where it left off.
function usePageVisible() {
  const [visible, setVisible] = useState(
    () => typeof document === 'undefined' || document.visibilityState === 'visible',
  )
  useEffect(() => {
    const onChange = () => setVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', onChange)
    return () => document.removeEventListener('visibilitychange', onChange)
  }, [])
  return visible
}

export function Walkthrough() {
  const reduce = useReducedMotion() ?? false
  const visible = usePageVisible()
  const [scene, setScene] = useState<Scene>(0)

  useEffect(() => {
    if (!visible) return
    const t = setTimeout(() => setScene((s) => ((s + 1) % 4) as Scene), SCENE_MS)
    return () => clearTimeout(t)
  }, [scene, visible])

  return (
    <div
      role="img"
      aria-label="A short demo of the Stylify app: take a photo of a hoodie, Stylify guesses it is outerwear, and it joins your closet."
      className="w-[290px] shrink-0 rounded-[40px] bg-[#1a120c] p-2.5"
    >
      <div
        aria-hidden="true"
        inert
        className="relative h-[580px] overflow-hidden rounded-[31px] bg-cream text-ink"
      >
        <StatusBar />
        <AnimatePresence initial={false}>
          {scene === 3 ? (
            <Screen key="closet">
              <ClosetScreen reduce={reduce} />
            </Screen>
          ) : (
            <Screen key="add">
              <AddScreen scene={scene} reduce={reduce} />
            </Screen>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

function StatusBar() {
  return (
    <div className="relative z-10 flex justify-between px-6 pb-1 pt-3 text-xs font-extrabold text-black">
      <span>9:41</span>
      <span className="flex items-center gap-1" aria-hidden>
        <span className="h-2.5 w-4 rounded-[3px] border-[1.5px] border-black" />
      </span>
    </div>
  )
}

// Screens cross-fade, with or without reduced motion.
function Screen({ children }: { children: ReactNode }) {
  return (
    <motion.div
      className="absolute inset-0 top-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
    >
      {children}
    </motion.div>
  )
}

// A piece of the screen that fades between versions as the scene changes.
function Swap({ id, children, className }: { id: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('relative', className)}>
      <AnimatePresence initial={false} mode="wait">
        <motion.div
          key={id}
          className="absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

function AddScreen({ scene, reduce }: { scene: Exclude<Scene, 3>; reduce: boolean }) {
  const filled = scene > 0
  const outerwear = typeColors.outerwear
  return (
    <div className="flex h-full flex-col px-[18px]">
      <h3 className="pb-2 pt-1.5 text-2xl font-black tracking-tight">New piece</h3>

      <div
        className="relative aspect-[1.15] overflow-hidden rounded-[22px] border-b-[5px] border-black/[.08]"
        style={{ backgroundColor: filled ? outerwear.bg : '#ffffff' }}
      >
        <AnimatePresence initial={false}>
          {filled ? (
            <motion.div
              key="photo"
              className="absolute inset-0 flex items-center justify-center"
              style={{ color: outerwear.fg }}
              initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <Garment kind="outerwear" className="h-1/2 w-1/2" />
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              className="absolute inset-0 m-3 flex items-center justify-center rounded-2xl border-2 border-dashed border-line text-muted"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <Camera className="h-11 w-11" strokeWidth={2.5} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <Swap id={`line-${scene}`} className="mt-3 h-6">
        {scene === 1 ? (
          <p className="text-[15px] font-extrabold">Hmm, let me look…</p>
        ) : scene === 2 ? (
          <p className="text-[15px] font-extrabold">Ooh, that looks like Outerwear!</p>
        ) : null}
      </Swap>

      <div className="mt-2 flex h-12 items-start gap-1.5 [&_button]:px-2.5 [&_button]:text-[13px]">
        {scene === 2 ? (
          <>
            <ChipBounce reduce={reduce}>
              <TypeChip type="outerwear" selected onClick={noop} index={0}>
                Outerwear
              </TypeChip>
            </ChipBounce>
            <TypeChip type="top" selected={false} onClick={noop} index={1}>
              Top
            </TypeChip>
            <TypeChip type="trousers" selected={false} onClick={noop} index={2}>
              Trousers
            </TypeChip>
          </>
        ) : null}
      </div>

      <div className="mt-auto pb-7">
        <Swap id={scene === 0 ? 'take' : scene === 2 ? 'add' : 'wait'} className="h-[58px]">
          {scene === 0 ? (
            <motion.div
              className={cn(chunkyClasses('primary', 'md'), 'w-full')}
              animate={reduce ? undefined : { scale: [1, 1.05, 1] }}
              transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
            >
              <Camera className="h-5 w-5" strokeWidth={3} />
              Take photo
            </motion.div>
          ) : scene === 2 ? (
            <div className={cn(chunkyClasses('primary', 'md'), 'w-full')}>Add to closet</div>
          ) : (
            <div className={cn(chunkyClasses('primary', 'md'), 'w-full opacity-40')}>
              Add to closet
            </div>
          )}
        </Swap>
      </div>
    </div>
  )
}

// The top guess does a short hop once it has popped in.
function ChipBounce({ reduce, children }: { reduce: boolean; children: ReactNode }) {
  return (
    <motion.div
      animate={reduce ? undefined : { y: [0, 0, -6, 0, -2, 0] }}
      transition={{ duration: 0.9, delay: 0.35, times: [0, 0.3, 0.5, 0.7, 0.85, 1] }}
    >
      {children}
    </motion.div>
  )
}

const CLOSET: { key: string; type: TypeKey; name: string; meta: string }[] = [
  { key: 'hoodie', type: 'outerwear', name: 'Zip hoodie', meta: 'Outerwear · M' },
  { key: 'tee', type: 'top', name: 'Stussy tee', meta: 'Top · L' },
  { key: 'beanie', type: 'hat', name: 'Black beanie', meta: 'Hat · S' },
  { key: 'chinos', type: 'trousers', name: 'Chinos', meta: 'Trousers · 32' },
]

function ClosetScreen({ reduce }: { reduce: boolean }) {
  return (
    <div className="flex h-full flex-col">
      <div className="px-[18px]">
        <h3 className="pt-1.5 text-[29px] font-black leading-tight tracking-tight">
          Your <span className="rounded-lg bg-sun px-1.5">closet</span>
        </h3>
        <p className="pb-3 text-[13px] font-bold text-muted">4 pieces, nicely sorted.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 px-[18px]">
        {CLOSET.map((item, i) => {
          const { bg, fg } = typeColors[item.type]
          const isNew = i === 0
          return (
            <motion.div
              key={item.key}
              initial={isNew && !reduce ? { y: -60, opacity: 0, scale: 0.9 } : false}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 420, damping: 15, delay: 0.25 }}
            >
              <div
                className="flex aspect-square items-center justify-center rounded-[20px] border-b-[5px] border-black/[.08]"
                style={{ backgroundColor: bg, color: fg }}
              >
                <Garment kind={item.type} className="h-[56%] w-[56%]" />
              </div>
              <div className="px-0.5 pt-1.5">
                <b className="block truncate text-sm font-extrabold">{item.name}</b>
                <span className="block truncate text-xs font-bold text-muted">{item.meta}</span>
              </div>
            </motion.div>
          )
        })}
      </div>
      <div className="absolute inset-x-0 bottom-0 flex h-[72px] items-start justify-around border-t-2 border-line bg-cream pt-3 text-[11px] font-extrabold text-[#b39a86]">
        <span className="text-coral">Closet</span>
        <span className="-mt-6 flex h-[50px] w-[54px] items-center justify-center rounded-[18px] bg-coral text-white shadow-[0_5px_0_0_theme(colors.coral-dark)]">
          <Plus className="h-7 w-7" strokeWidth={3.5} />
        </span>
        <span>Me</span>
      </div>
    </div>
  )
}
