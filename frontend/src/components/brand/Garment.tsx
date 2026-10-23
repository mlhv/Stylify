import { GARMENT_PATHS, type TypeKey } from '@stylify/shared/brand'

type GarmentProps = {
  kind: TypeKey | 'hanger'
  className?: string
}

// A flat garment silhouette in the current text colour; size it with className.
export function Garment({ kind, className }: GarmentProps) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true" focusable="false">
      {GARMENT_PATHS[kind].map((d) => (
        <path key={d} d={d} fill="currentColor" fillRule="evenodd" />
      ))}
    </svg>
  )
}
