import { colors } from '@stylify/shared/brand'
import { View } from 'react-native'

import { Sinkable } from './Sinkable'
import { Txt } from './Txt'

const UNSELECTED_TEXT = '#8a6f5c'

export function Pill({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Sinkable
      edgeColor={selected ? '#000000' : colors.line}
      depth={4}
      radius={14}
      onPress={onPress}
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      faceStyle={{
        backgroundColor: selected ? colors.ink : colors.white,
        borderWidth: 2,
        borderColor: selected ? '#000000' : colors.line,
      }}>
      <View className="max-w-[220px] px-3.5 py-1.5">
        <Txt weight="heavy" numberOfLines={1} className="text-[13px]" style={{ color: selected ? colors.cream : UNSELECTED_TEXT }}>
          {label}
        </Txt>
      </View>
    </Sinkable>
  )
}
