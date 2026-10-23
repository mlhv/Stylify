import { typeColors, typeKey, TYPE_NAMES } from '@stylify/shared/brand'
import { Image } from 'expo-image'
import { Link } from 'expo-router'
import { useState } from 'react'
import { Pressable, View } from 'react-native'
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'

import { Garment } from '@/components/ui/Garment'
import { Txt } from '@/components/ui/Txt'
import { type Item } from '@/lib/api'

/** One closet tile: a square on the type's colour with the photo, or its garment when there is none. */
export function ItemTile({ item, index }: { item: Item; index: number }) {
  const reduce = useReducedMotion()
  const scale = useSharedValue(1)
  const motion = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }))
  const [failed, setFailed] = useState(false)

  const key = typeKey(item.type)
  const { bg, fg } = typeColors[key]
  const showPhoto = !!item.imageUrl && !failed
  const meta = [item.type, item.size, item.color].filter(Boolean).join(' · ')

  return (
    <Animated.View
      className="w-1/2 p-1.5"
      entering={reduce ? undefined : FadeInDown.delay(Math.min(index, 10) * 40)}>
      <Link href={{ pathname: '/item/[id]', params: { id: item.id } }} asChild>
        <Pressable
          accessibilityLabel={`Edit ${item.name || TYPE_NAMES[key]}`}
          onPressIn={() => scale.set(withTiming(0.97, { duration: 80 }))}
          onPressOut={() => scale.set(withTiming(1, { duration: 80 }))}>
          <Animated.View style={motion}>
            <View
              style={{
                aspectRatio: 1,
                borderRadius: 20,
                borderBottomWidth: 5,
                borderBottomColor: 'rgba(0,0,0,0.08)',
                backgroundColor: bg,
                overflow: 'hidden',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              {showPhoto ? (
                <Image
                  source={{ uri: item.imageUrl }}
                  style={{ width: '100%', height: '100%' }}
                  contentFit="cover"
                  onError={() => setFailed(true)}
                />
              ) : (
                <GarmentFill kind={key} color={fg} />
              )}
            </View>
            <Txt weight="heavy" numberOfLines={1} className="mt-2 text-[14px]">
              {item.name}
            </Txt>
            <Txt numberOfLines={1} className="text-[12px] text-muted">
              {meta}
            </Txt>
          </Animated.View>
        </Pressable>
      </Link>
    </Animated.View>
  )
}

function GarmentFill({ kind, color }: { kind: ReturnType<typeof typeKey>; color: string }) {
  // 56% of the tile; the tile is half the screen less gutters, so size it from layout.
  const [side, setSide] = useState(0)
  return (
    <View
      style={{ width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}
      onLayout={(e) => setSide(e.nativeEvent.layout.width)}>
      {side > 0 ? <Garment kind={kind} size={Math.round(side * 0.56)} color={color} /> : null}
    </View>
  )
}
