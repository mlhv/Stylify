import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/outfit-suggestions')({
  component: () => <div>Hello /_authenticated/outfit-suggestions!</div>,
})
