import { useKindeAuth } from '@kinde/expo'
import { useQuery } from '@tanstack/react-query'
import { Image } from 'expo-image'
import { Pressable, Text, View } from 'react-native'

import { getTotalClothesQueryOptions } from '@/lib/api'

export default function Profile() {
  const kinde = useKindeAuth()
  // The bearer token carries only the user ID, so the profile comes from the SDK.
  const profile = useQuery({ queryKey: ['kinde-profile'], queryFn: () => kinde.getUserProfile(), staleTime: Infinity })
  const total = useQuery(getTotalClothesQueryOptions)

  const user = profile.data
  const name = [user?.givenName, user?.familyName].filter(Boolean).join(' ')

  return (
    <View className="flex-1 items-center gap-3 bg-white p-6">
      {user?.picture ? (
        <Image source={{ uri: user.picture }} style={{ width: 96, height: 96, borderRadius: 48 }} />
      ) : (
        <View className="h-24 w-24 rounded-full bg-neutral-200" />
      )}
      <Text className="text-2xl font-bold">{name || 'Your profile'}</Text>
      {user?.email ? <Text className="text-neutral-600">{user.email}</Text> : null}
      <Text className="text-neutral-600">
        {total.data ? `${total.data.total} ${total.data.total === 1 ? 'item' : 'items'}` : total.isError ? 'Item count unavailable' : ' '}
      </Text>
      <Pressable className="mt-6 w-full items-center rounded-lg bg-neutral-900 py-4" onPress={() => void kinde.logout({ revokeToken: true })}>
        <Text className="font-semibold text-white">Sign out</Text>
      </Pressable>
    </View>
  )
}
