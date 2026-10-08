import { Pressable, Text, View } from 'react-native'

import { ServerUnreachableError } from '@/lib/authFetch'

export function errorMessage(error: unknown): string {
  if (error instanceof ServerUnreachableError) return "Can't reach the server. Check your connection and try again."
  if (error instanceof Error) return error.message
  return 'Something went wrong'
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <View className="flex-1 items-center justify-center gap-4 p-6">
      <Text className="text-center text-base text-neutral-700">{errorMessage(error)}</Text>
      <Pressable className="rounded-lg bg-neutral-900 px-5 py-3" onPress={onRetry}>
        <Text className="font-semibold text-white">Try again</Text>
      </Pressable>
    </View>
  )
}
