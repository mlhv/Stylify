import { colors } from '@stylify/shared/brand'
import { View } from 'react-native'

import { ChunkyButton } from '@/components/ui/ChunkyButton'
import { Garment } from '@/components/ui/Garment'
import { Txt } from '@/components/ui/Txt'
import { ServerUnreachableError } from '@/lib/authFetch'

export function errorMessage(error: unknown): string {
  if (error instanceof ServerUnreachableError) return "Can't reach the server. Check your connection and try again."
  if (error instanceof Error) return error.message
  return 'Something went wrong'
}

export function ErrorState({
  error,
  onRetry,
  retryLabel = 'Try again',
}: {
  error: unknown
  onRetry: () => void
  retryLabel?: string
}) {
  return (
    <View className="flex-1 items-center justify-center gap-4 p-6">
      <Garment kind="other" size={72} color={colors.muted} />
      <Txt className="text-center text-base">{errorMessage(error)}</Txt>
      <ChunkyButton label={retryLabel} onPress={onRetry} />
    </View>
  )
}
