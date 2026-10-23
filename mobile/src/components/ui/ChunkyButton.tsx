import { Ionicons } from '@expo/vector-icons'
import { colors } from '@stylify/shared/brand'
import { type ComponentProps } from 'react'
import { ActivityIndicator, Pressable, View } from 'react-native'

import { Sinkable } from './Sinkable'
import { Txt } from './Txt'

type Variant = 'primary' | 'secondary' | 'danger' | 'quiet'
type IoniconName = ComponentProps<typeof Ionicons>['name']

const LOOK: Record<Exclude<Variant, 'quiet'>, { face: string; edge: string; text: string; border?: string }> = {
  primary: { face: colors.coral, edge: colors.coralDark, text: colors.white },
  secondary: { face: colors.white, edge: colors.line, text: colors.ink, border: colors.line },
  danger: { face: colors.danger, edge: colors.dangerDark, text: colors.white },
}

export function ChunkyButton({
  label,
  onPress,
  variant = 'primary',
  icon,
  busy = false,
  disabled = false,
}: {
  label: string
  onPress: () => void
  variant?: Variant
  icon?: IoniconName
  busy?: boolean
  disabled?: boolean
}) {
  const inactive = disabled || busy

  if (variant === 'quiet') {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: inactive, busy }}
        disabled={inactive}
        onPress={onPress}
        hitSlop={8}
        className="flex-row items-center justify-center gap-2 py-3"
        style={({ pressed }) => ({ opacity: inactive ? 0.5 : pressed ? 0.6 : 1 })}>
        {busy ? (
          <ActivityIndicator color={colors.muted} />
        ) : (
          <>
            {icon ? <Ionicons name={icon} size={18} color={colors.muted} /> : null}
            <Txt weight="heavy" className="text-[16px] text-muted">
              {label}
            </Txt>
          </>
        )}
      </Pressable>
    )
  }

  const look = LOOK[variant]
  return (
    <Sinkable
      edgeColor={look.edge}
      depth={5}
      radius={16}
      disabled={inactive}
      onPress={onPress}
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy }}
      faceStyle={{
        backgroundColor: look.face,
        borderWidth: look.border ? 2 : 0,
        borderColor: look.border,
      }}>
      <View className="min-h-[52px] flex-row items-center justify-center gap-2 px-5 py-3.5">
        {busy ? (
          <ActivityIndicator color={look.text} />
        ) : (
          <>
            {icon ? <Ionicons name={icon} size={20} color={look.text} /> : null}
            <Txt weight="black" className="text-[16px] tracking-[0.3px]" style={{ color: look.text }}>
              {label}
            </Txt>
          </>
        )}
      </View>
    </Sinkable>
  )
}
