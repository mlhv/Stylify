import { colors, filterItems, groupByType, resolveFilter, TYPE_NAMES, type Filter } from '@stylify/shared/brand'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { FlatList, RefreshControl, ScrollView, Text, View } from 'react-native'
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'

import { EmptyCloset } from '@/components/EmptyCloset'
import { ErrorState } from '@/components/ErrorState'
import { ItemTile } from '@/components/ItemTile'
import { Pill } from '@/components/ui/Pill'
import { Screen } from '@/components/ui/Screen'
import { getAllItemsQueryOptions } from '@/lib/api'

const TITLE = (
  <>
    Your <Text style={{ backgroundColor: colors.sun }}> closet </Text>
  </>
)

function Skeletons() {
  const reduce = useReducedMotion()
  const pulse = useSharedValue(1)
  const style = useAnimatedStyle(() => ({ opacity: pulse.get() }))

  useEffect(() => {
    if (reduce) return
    pulse.set(withRepeat(withTiming(0.5, { duration: 700 }), -1, true))
    return () => cancelAnimation(pulse)
  }, [reduce, pulse])

  return (
    <View className="flex-row flex-wrap px-3">
      {Array.from({ length: 6 }, (_, i) => (
        <Animated.View key={i} className="w-1/2 p-1.5" style={style}>
          <View className="aspect-square w-full rounded-[20px] bg-line" />
          <View className="mt-2 h-4 w-2/3 rounded bg-line" />
        </Animated.View>
      ))}
    </View>
  )
}

export default function Closet() {
  const router = useRouter()
  const { data, error, isPending, isRefetching, refetch } = useQuery(getAllItemsQueryOptions)
  const [selected, setSelected] = useState<Filter>('all')

  if (isPending) {
    return (
      <Screen title={TITLE}>
        <Skeletons />
      </Screen>
    )
  }
  if (error && !data) {
    return (
      <Screen title={TITLE}>
        <ErrorState error={error} onRetry={() => void refetch()} />
      </Screen>
    )
  }

  const items = data.items
  if (items.length === 0) {
    return (
      <Screen title={TITLE}>
        <EmptyCloset onAdd={() => router.navigate('/add')} />
      </Screen>
    )
  }

  const groups = groupByType(items)
  // A filter whose last item was deleted or retyped falls back to All.
  const filter = resolveFilter(selected, groups)
  const shown = filterItems(items, filter)

  return (
    <Screen title={TITLE} subtitle={`${items.length} ${items.length === 1 ? 'piece' : 'pieces'}, nicely sorted.`}>
      <View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 6, gap: 8 }}
          style={{ flexGrow: 0 }}>
          <Pill label="All" selected={filter === 'all'} onPress={() => setSelected('all')} />
          {groups.map((g) => (
            <Pill key={g.key} label={TYPE_NAMES[g.key]} selected={filter === g.key} onPress={() => setSelected(g.key)} />
          ))}
        </ScrollView>
      </View>
      <FlatList
        data={shown}
        keyExtractor={(item) => item.id.toString()}
        numColumns={2}
        contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 24 }}
        renderItem={({ item, index }) => <ItemTile item={item} index={index} />}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />}
      />
    </Screen>
  )
}
