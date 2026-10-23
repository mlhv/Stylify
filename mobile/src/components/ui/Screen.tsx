import { colors } from '@stylify/shared/brand'
import { type ReactNode } from 'react'
import { View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { Txt } from './Txt'

/** A tab screen: cream, below the status bar, with the in-content heading from the mockup. */
export function Screen({ title, subtitle, children }: { title: ReactNode; subtitle?: string; children: ReactNode }) {
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.cream }}>
      <View className="px-[18px] pb-3 pt-1.5">
        <Txt weight="black" accessibilityRole="header" className="text-[30px] tracking-[-0.5px]">
          {title}
        </Txt>
        {subtitle ? <Txt className="mt-0.5 text-[14px] text-muted">{subtitle}</Txt> : null}
      </View>
      {children}
    </SafeAreaView>
  )
}
