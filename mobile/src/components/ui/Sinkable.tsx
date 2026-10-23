import { type ReactNode } from 'react'
import { Pressable, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'

/**
 * The chunky press: a solid edge in `edgeColor` under the face, and the face sinks onto it
 * (by `depth` px, over 80 ms) while pressed. The edge is an outer view the face sits on,
 * translated up by `depth`; the margin keeps the raised face from overlapping what is above.
 */
export function Sinkable({
  edgeColor,
  depth,
  radius,
  faceStyle,
  style,
  children,
  disabled,
  ...pressable
}: Omit<PressableProps, 'children' | 'style'> & {
  edgeColor: string
  depth: number
  radius: number
  faceStyle?: StyleProp<ViewStyle>
  style?: StyleProp<ViewStyle>
  children: ReactNode
}) {
  const sink = useSharedValue(0)
  const faceMotion = useAnimatedStyle(() => ({ transform: [{ translateY: sink.get() - depth }] }))
  const press = (to: number) => sink.set(withTiming(to, { duration: 80 }))

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPressIn={() => press(depth)}
      onPressOut={() => press(0)}
      style={[{ marginTop: depth, opacity: disabled ? 0.5 : 1 }, style]}
      {...pressable}>
      <View style={{ backgroundColor: edgeColor, borderRadius: radius }}>
        <Animated.View style={[{ borderRadius: radius }, faceStyle, faceMotion]}>
          {children}
        </Animated.View>
      </View>
    </Pressable>
  )
}
