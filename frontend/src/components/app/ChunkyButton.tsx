import { type ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

type Variant = 'primary' | 'secondary' | 'danger' | 'quiet'
type Size = 'md' | 'lg'

export const chunkyClasses = (variant: Variant = 'primary', size: Size = 'md') =>
  cn(
    'inline-flex items-center justify-center gap-2 rounded-2xl font-extrabold transition-[transform,box-shadow] duration-75',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral focus-visible:ring-offset-2 focus-visible:ring-offset-cream',
    'disabled:pointer-events-none disabled:opacity-50',
    size === 'lg' ? 'px-6 py-3.5 text-lg' : 'px-5 py-2.5 text-base',
    variant === 'primary' &&
      'bg-coral text-white shadow-[0_5px_0_0_theme(colors.coral-dark)] active:translate-y-[5px] active:shadow-none',
    variant === 'secondary' &&
      'bg-white text-ink shadow-[0_5px_0_0_theme(colors.line)] active:translate-y-[5px] active:shadow-none',
    variant === 'danger' &&
      'bg-danger text-white shadow-[0_5px_0_0_theme(colors.danger-dark)] active:translate-y-[5px] active:shadow-none',
    variant === 'quiet' && 'bg-transparent text-muted hover:text-ink',
  )

export function ChunkyButton({
  variant = 'primary',
  size = 'md',
  className,
  type = 'button',
  ...props
}: { variant?: Variant; size?: Size } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={type} className={cn(chunkyClasses(variant, size), className)} {...props} />
}
