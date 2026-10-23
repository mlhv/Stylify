import { Ionicons } from '@expo/vector-icons'
import { type BottomTabBarButtonProps } from '@react-navigation/bottom-tabs'
import { colors } from '@stylify/shared/brand'
import { Tabs } from 'expo-router'
import { View } from 'react-native'

import { Sinkable } from '@/components/ui/Sinkable'

const INACTIVE = '#b39a86'

// The raised coral + in the middle of the bar: a 54 × 50 face on a 5 px coral-dark edge,
// its top 22 px above the bar.
function AddButton({ onPress, accessibilityState, style }: BottomTabBarButtonProps) {
  return (
    <View style={[style, { alignItems: 'center' }]}>
      <Sinkable
        edgeColor={colors.coralDark}
        depth={5}
        radius={18}
        onPress={onPress}
        accessibilityLabel="Add a piece"
        accessibilityState={{ selected: accessibilityState?.selected }}
        style={{ marginTop: -22 + 5 }}
        faceStyle={{ width: 54, height: 50, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.coral }}>
        <Ionicons name="add" size={32} color={colors.white} />
      </Sinkable>
    </View>
  )
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.coral,
        tabBarInactiveTintColor: INACTIVE,
        tabBarStyle: { backgroundColor: colors.cream, borderTopWidth: 2, borderTopColor: colors.line },
        tabBarLabelStyle: { fontFamily: 'Nunito_800ExtraBold', fontSize: 11 },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Closet',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'shirt' : 'shirt-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen name="add" options={{ title: 'Add', tabBarButton: (props) => <AddButton {...props} /> }} />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Me',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'person' : 'person-outline'} size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  )
}
