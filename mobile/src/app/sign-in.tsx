import { useKindeAuth } from '@kinde/expo'
import { useState } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'

import { KINDE_AUDIENCE } from '@/lib/config'

export default function SignIn() {
  const kinde = useKindeAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function signIn() {
    setBusy(true)
    setError(null)
    try {
      const result = await kinde.login({ audience: KINDE_AUDIENCE })
      if (!result.success) setError(result.errorMessage)
    } catch {
      setError('Could not open sign-in. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <View className="flex-1 items-center justify-center gap-6 bg-white p-6">
      <Text className="text-4xl font-bold">Stylify</Text>
      <Text className="text-center text-neutral-600">Your wardrobe, on your phone.</Text>
      <Pressable className="w-full items-center rounded-lg bg-neutral-900 py-4" disabled={busy} onPress={signIn}>
        {busy ? <ActivityIndicator color="white" /> : <Text className="font-semibold text-white">Sign in</Text>}
      </Pressable>
      {error ? <Text className="text-center text-red-600">{error}</Text> : null}
    </View>
  )
}
