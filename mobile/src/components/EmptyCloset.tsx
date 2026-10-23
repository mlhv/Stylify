import { colors } from '@stylify/shared/brand'
import { useEffect } from 'react'
import { View } from 'react-native'
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'

import { ChunkyButton } from '@/components/ui/ChunkyButton'
import { Garment } from '@/components/ui/Garment'
import { Txt } from '@/components/ui/Txt'

/** Shown when the closet has no items: a floating hanger and the way to add the first piece. */
export function EmptyCloset({ onAdd }: { onAdd: () => void }) {
  const reduce = useReducedMotion()
  const lift = useSharedValue(0)
  const float = useAnimatedStyle(() => ({ transform: [{ translateY: lift.get() }] }))

  useEffect(() => {
    if (reduce) return
    lift.set(
      withRepeat(
        withSequence(
          withTiming(-8, { duration: 1400, easing: Easing.inOut(Easing.quad) }),
          withTiming(0, { duration: 1400, easing: Easing.inOut(Easing.quad) }),
        ),
        -1,
      ),
    )
    return () => cancelAnimation(lift)
  }, [reduce, lift])

  return (
    <View className="flex-1 items-center justify-center gap-3 px-8 pb-16">
      <Animated.View
        style={[
          { width: 140, height: 140, borderRadius: 70, backgroundColor: '#ffe1d6', alignItems: 'center', justifyContent: 'center' },
          float,
        ]}>
        <Garment kind="hanger" size={80} color={colors.coral} />
      </Animated.View>
      <Txt weight="black" className="mt-2 text-center text-[22px]">
        It's a bit empty in here
      </Txt>
      <Txt className="mb-3 text-center text-[15px] text-muted">
        Snap your first piece and we'll figure out what it is for you.
      </Txt>
      <ChunkyButton label="Add your first piece" onPress={onAdd} />
    </View>
  )
}
