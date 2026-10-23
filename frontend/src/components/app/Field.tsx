import { useId, type InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export function Field({
  label,
  error,
  className,
  id,
  ...props
}: { label: string; error?: string } & InputHTMLAttributes<HTMLInputElement>) {
  const auto = useId()
  const inputId = id ?? auto
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-extrabold text-ink">
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        className={cn(
          'rounded-[14px] border-2 border-line bg-white px-4 py-3 font-bold text-ink placeholder:text-muted',
          'focus:outline-none focus:ring-2 focus:ring-coral focus:border-coral',
          error && 'border-danger',
          className,
        )}
        {...props}
      />
      {error ? <p className="text-sm font-bold text-danger">{error}</p> : null}
    </div>
  )
}
