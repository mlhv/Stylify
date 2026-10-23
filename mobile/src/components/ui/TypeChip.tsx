import { colors, typeColors, type TypeKey } from '@stylify/shared/brand'
import { useEffect, useRef } from 'react'
import { View } from 'react-native'
import Animated, {
  FadeIn,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
  ZoomIn,
} from 'react-native-reanimated'

import { Sinkable } from './Sinkable'
import { Txt } from './Txt'

const UNSELECTED_TEXT = '#8a6f5c'
const STAGGER_MS = 60
// Roughly when the spring entrance has settled, so the bounce does not fight it.
const BOUNCE_AFTER_MS = 350

/** A type chip in its type colours when selected; pops in after `index` earlier chips, and the top guess bounces. */
export function TypeChip({
  type,
  label,
  selected,
  onPress,
  index = 0,
}: {
  type: TypeKey
  label: string
  selected: boolean
  onPress: () => void
  index?: number
}) {
  const reduce = useReducedMotion()
  const lift = useSharedValue(0)
  const bounced = useRef(false)
  // Only the top guess as the chips arrive bounces; a first chip selected later by a tap does not.
  const selectedAtMount = useRef(selected)
  const bounceStyle = useAnimatedStyle(() => ({ transform: [{ translateY: lift.get() }] }))

  useEffect(() => {
    if (reduce || bounced.current || !selectedAtMount.current || index !== 0) return
    bounced.current = true
    lift.set(
      withDelay(
        index * STAGGER_MS + BOUNCE_AFTER_MS,
        withSequence(
          withTiming(-6, { duration: 90 }),
          withTiming(0, { duration: 90 }),
          withTiming(-2, { duration: 70 }),
          withTiming(0, { duration: 70 }),
        ),
      ),
    )
  }, [reduce, index, lift])

  const { bg, fg } = typeColors[type]
  const delay = index * STAGGER_MS
  return (
    <Animated.View
      // Under reduced motion only a fade; Reanimated would otherwise skip the entrance altogether.
      entering={reduce ? FadeIn.reduceMotion(ReduceMotion.Never) : FadeIn.delay(delay)}>
      <Animated.View entering={reduce ? undefined : ZoomIn.springify().delay(delay)}>
        <Animated.View style={bounceStyle}>
          <Sinkable
            edgeColor={selected ? fg : colors.line}
            depth={4}
            radius={14}
            onPress={onPress}
            accessibilityLabel={label}
            accessibilityState={{ selected }}
            faceStyle={{
              backgroundColor: selected ? bg : colors.white,
              borderWidth: 2,
              borderColor: selected ? fg : colors.line,
            }}>
            <View className="max-w-[200px] px-3.5 py-1.5">
              <Txt weight="heavy" numberOfLines={1} className="text-[13px]" style={{ color: selected ? fg : UNSELECTED_TEXT }}>
                {label}
              </Txt>
            </View>
          </Sinkable>
        </Animated.View>
      </Animated.View>
    </Animated.View>
  )
}
