import { Ionicons } from '@expo/vector-icons'
import { Tabs, useRouter } from 'expo-router'
import { Pressable, Text } from 'react-native'

// Looks like the back button of the pushed edit screen: iOS blue chevron and the destination's name.
function BackToWardrobe() {
  const router = useRouter()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Back to Wardrobe"
      className="flex-row items-center pl-2"
      hitSlop={8}
      onPress={() => router.navigate('/')}>
      <Ionicons name="chevron-back" size={28} color="#007AFF" />
      <Text className="-ml-1 text-[17px]" style={{ color: '#007AFF' }}>
        Wardrobe
      </Text>
    </Pressable>
  )
}

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: '#171717' }}>
      <Tabs.Screen
        name="index"
        options={{ title: 'Wardrobe', tabBarIcon: ({ color, size }) => <Ionicons name="shirt-outline" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="add"
        options={{
          title: 'Add',
          headerLeft: () => <BackToWardrobe />,
          tabBarIcon: ({ color, size }) => <Ionicons name="add-circle-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Profile', tabBarIcon: ({ color, size }) => <Ionicons name="person-outline" size={size} color={color} /> }}
      />
    </Tabs>
  )
}
