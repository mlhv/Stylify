import { colors } from '@stylify/shared/brand'
import { cn } from '@/lib/utils'
import { Garment } from './Garment'

// The hanger in coral beside the "Stylify" wordmark.
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span style={{ color: colors.coral }} className="inline-flex shrink-0">
        <Garment kind="hanger" className="h-8 w-8" />
      </span>
      <span
        style={{
          color: colors.ink,
          fontFamily: 'Nunito, ui-rounded, system-ui, sans-serif',
          fontWeight: 900,
          letterSpacing: '-0.02em',
        }}
        className="text-2xl leading-none"
      >
        Stylify
      </span>
    </span>
  )
}
