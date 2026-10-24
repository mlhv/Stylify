import { useKindeAuth } from '@kinde/expo'
import { groupByType, typeColors, TYPE_NAMES } from '@stylify/shared/brand'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Image } from 'expo-image'
import { useState } from 'react'
import { Alert, ScrollView, View } from 'react-native'

import { ErrorState, errorMessage } from '@/components/ErrorState'
import { ChunkyButton } from '@/components/ui/ChunkyButton'
import { Garment } from '@/components/ui/Garment'
import { Screen } from '@/components/ui/Screen'
import { Txt } from '@/components/ui/Txt'
import { getAllItemsQueryOptions } from '@/lib/api'
import { endSession } from '@/lib/endSession'
import { kindeSessionEnd } from '@/lib/kindeSession'

// The same neutral 8% black edge as the closet tiles.
const EDGE = { borderBottomWidth: 5, borderBottomColor: 'rgba(0,0,0,0.08)' } as const

function initials(first?: string | null, last?: string | null) {
  return [first, last]
    .filter(Boolean)
    .join(' ')
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export default function Profile() {
  const kinde = useKindeAuth()
  const queryClient = useQueryClient()
  // The bearer token carries only the user ID, so the profile comes from the SDK.
  const profile = useQuery({
    queryKey: ['kinde-profile'],
    // A null profile is a failure, so it is retried instead of cached for good.
    queryFn: async () => {
      const result = await kinde.getUserProfile()
      if (!result) throw new Error('Could not load your profile')
      return result
    },
    staleTime: Infinity,
  })
  const items = useQuery(getAllItemsQueryOptions)

  const [signingOut, setSigningOut] = useState(false)

  async function signOut() {
    setSigningOut(true)
    try {
      // Same as the automatic path: the next person to sign in must not see this wardrobe.
      queryClient.clear()
      await endSession(kindeSessionEnd)
    } catch (e) {
      Alert.alert('Could not sign out', errorMessage(e))
    } finally {
      setSigningOut(false)
    }
  }

  const signOutButton = <ChunkyButton variant="quiet" label="Sign out" busy={signingOut} onPress={() => void signOut()} />

  if (profile.isError && !profile.data) {
    return (
      <Screen title="Me">
        <ErrorState error={profile.error} onRetry={() => void profile.refetch()} />
        <View className="px-[18px] pb-24">{signOutButton}</View>
      </Screen>
    )
  }

  const user = profile.data
  const name = [user?.givenName, user?.familyName].filter(Boolean).join(' ')
  const list = items.data?.items
  const groups = list ? groupByType(list) : []

  return (
    <Screen title="Me">
      <ScrollView contentContainerClassName="px-[18px] pb-32">
        <View className="rounded-[20px] bg-white p-5" style={EDGE}>
          <View className="flex-row items-center gap-4">
            {user?.picture ? (
              <Image source={{ uri: user.picture }} style={{ width: 72, height: 72, borderRadius: 36 }} />
            ) : (
              <View className="h-[72px] w-[72px] items-center justify-center rounded-full bg-sun">
                <Txt weight="black" className="text-[26px]">
                  {initials(user?.givenName, user?.familyName) || ' '}
                </Txt>
              </View>
            )}
            <View className="flex-1">
              <Txt weight="black" numberOfLines={1} className="text-[22px]">
                {name || 'You'}
              </Txt>
              {user?.email ? (
                <Txt numberOfLines={1} className="text-[14px] text-muted">
                  {user.email}
                </Txt>
              ) : null}
            </View>
          </View>

          <Txt weight="heavy" className="mt-7 text-[17px]">
            Your closet in numbers
          </Txt>
          {items.isError && !list ? (
            <View className="mt-3 items-start gap-3">
              <Txt className="text-muted">{errorMessage(items.error)}</Txt>
              <ChunkyButton variant="secondary" label="Try again" onPress={() => void items.refetch()} />
            </View>
          ) : !list ? (
            <View className="mt-3 h-14 w-24 rounded-2xl bg-line" />
          ) : list.length === 0 ? (
            <Txt className="mt-3 text-[15px] text-muted">Nothing to count yet. Add your first piece!</Txt>
          ) : (
            <>
              <View className="mt-2 flex-row items-baseline gap-2">
                <Txt weight="black" className="text-[56px] leading-[60px]">
                  {list.length}
                </Txt>
                <Txt className="text-[16px] text-muted">{list.length === 1 ? 'piece' : 'pieces'}</Txt>
              </View>
              <View className="-mx-1.5 mt-3 flex-row flex-wrap">
                {groups.map(({ key, count }) => {
                  const { bg, fg } = typeColors[key]
                  return (
                    <View key={key} className="w-1/2 p-1.5">
                      <View
                        className="flex-row items-center gap-3 rounded-2xl p-3"
                        style={{ backgroundColor: bg, ...EDGE }}>
                        <Garment kind={key} size={36} color={fg} />
                        <View className="flex-1">
                          <Txt weight="black" className="text-[22px] leading-[24px]" style={{ color: fg }}>
                            {count}
                          </Txt>
                          <Txt weight="heavy" numberOfLines={1} className="text-[13px]" style={{ color: fg }}>
                            {TYPE_NAMES[key]}
                          </Txt>
                        </View>
                      </View>
                    </View>
                  )
                })}
              </View>
            </>
          )}

          <View className="mt-6 items-center border-t-2 border-line pt-2">{signOutButton}</View>
        </View>
      </ScrollView>
    </Screen>
  )
}
