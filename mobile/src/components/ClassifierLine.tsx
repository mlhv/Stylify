import { useEffect } from 'react'
import { View } from 'react-native'
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'

import { Txt } from '@/components/ui/Txt'
import { lineText, type LineKind } from '@/lib/suggestion'

const LINE = 'text-[15px]'

/**
 * The classifier's line under the Type field: thinking while it runs, then what it made of the photo.
 * `line` and `guess` come from decide(): how sure the run was, and its top guess.
 */
export function ClassifierLine({
  pending,
  hasChips,
  line,
  guess,
}: {
  pending: boolean
  hasChips: boolean
  line: LineKind
  guess: string | null
}) {
  if (pending) return <Thinking />
  if (!hasChips) return null
  return (
    <Txt weight="heavy" className={LINE} accessibilityLiveRegion="polite">
      {lineText(line, guess)}
    </Txt>
  )
}

const DOT_MS = 300

function Thinking() {
  const reduce = useReducedMotion()
  const dots = [useSharedValue(1), useSharedValue(1), useSharedValue(1)]

  useEffect(() => {
    if (reduce) return
    // Each dot fades in after the one before, they hold, then all fade out together and repeat.
    dots.forEach((dot, i) => {
      dot.set(0)
      dot.set(
        withRepeat(
          withSequence(
            withDelay(i * DOT_MS, withTiming(1, { duration: DOT_MS })),
            withDelay((2 - i) * DOT_MS + DOT_MS, withTiming(0, { duration: DOT_MS })),
          ),
          -1,
        ),
      )
    })
    return () => dots.forEach((dot) => cancelAnimation(dot))
    // The shared values are stable for the component's life.
  }, [reduce])

  return (
    <View className="flex-row" accessible accessibilityLabel="Hmm, let me look…">
      <Txt weight="heavy" className={LINE}>
        Hmm, let me look
      </Txt>
      {dots.map((dot, i) => (
        <Dot key={i} opacity={dot} />
      ))}
    </View>
  )
}

function Dot({ opacity }: { opacity: SharedValue<number> }) {
  const style = useAnimatedStyle(() => ({ opacity: opacity.get() }))
  return (
    <Animated.View style={style}>
      <Txt weight="heavy" className={LINE}>
        .
      </Txt>
    </Animated.View>
  )
}
