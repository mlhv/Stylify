import { useKindeAuth } from '@kinde/expo'
import { colors } from '@stylify/shared/brand'
import { useEffect, useState } from 'react'
import { View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'
import { SafeAreaView } from 'react-native-safe-area-context'

import { ChunkyButton } from '@/components/ui/ChunkyButton'
import { Garment } from '@/components/ui/Garment'
import { Txt } from '@/components/ui/Txt'
import { KINDE_AUDIENCE } from '@/lib/config'

// The hanger drifts up and tilts, then back, every 3 s. Still under reduced motion.
function FloatingHanger() {
  const reduce = useReducedMotion()
  const t = useSharedValue(0)
  useEffect(() => {
    if (reduce) return
    t.set(withRepeat(withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.ease) }), -1, true))
  }, [reduce, t])
  const float = useAnimatedStyle(() => ({
    transform: [{ translateY: -8 * t.get() }, { rotate: `${-4 + 8 * t.get()}deg` }],
  }))
  return (
    <View className="h-[180px] w-[180px] items-center justify-center rounded-full" style={{ backgroundColor: '#ffe1d6' }}>
      <Animated.View style={reduce ? undefined : float}>
        <Garment kind="hanger" size={120} color={colors.coral} />
      </Animated.View>
    </View>
  )
}

export default function SignIn() {
  const kinde = useKindeAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function signIn() {
    setBusy(true)
    setError(null)
    try {
      const result = await kinde.login({ audience: KINDE_AUDIENCE })
      // The SDK words any non-success result, including closing the sheet, as 'Unknown error'; that is not worth showing.
      if (!result.success && result.errorMessage !== 'Unknown error') setError(result.errorMessage)
    } catch {
      setError('Could not open sign-in. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.cream }}>
      <View className="flex-1 items-center justify-center px-7">
        <FloatingHanger />
        <Txt weight="black" accessibilityRole="header" className="mt-7 text-[40px] tracking-[-0.5px]">
          Stylify
        </Txt>
        <Txt className="mt-2 text-center text-[16px] leading-[23px] text-muted">
          Know everything in your closet. One photo per piece, and we'll do the rest.
        </Txt>
      </View>
      <View className="gap-4 px-6 pb-6">
        <ChunkyButton label="Sign in" onPress={() => void signIn()} busy={busy} />
        {error ? <Txt className="text-center text-danger">{error}</Txt> : null}
      </View>
    </SafeAreaView>
  )
}
