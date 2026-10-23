import { ChunkyButton } from './ChunkyButton'

export function ErrorPanel({
  title,
  message,
  actionLabel = 'Try again',
  onAction,
}: {
  title: string
  message: string
  actionLabel?: string
  onAction: () => void
}) {
  return (
    <div role="alert" className="mx-auto max-w-md rounded-3xl bg-white p-8 text-center shadow-[0_5px_0_0_theme(colors.line)]">
      <h2 className="text-xl font-extrabold">{title}</h2>
      <p className="mt-2 break-words text-muted">{message}</p>
      <ChunkyButton className="mt-6" onClick={onAction}>
        {actionLabel}
      </ChunkyButton>
    </div>
  )
}
