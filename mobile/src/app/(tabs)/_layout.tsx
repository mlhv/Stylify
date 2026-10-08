import { Ionicons } from '@expo/vector-icons'
import { Tabs } from 'expo-router'

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: '#171717' }}>
      <Tabs.Screen
        name="index"
        options={{ title: 'Wardrobe', tabBarIcon: ({ color, size }) => <Ionicons name="shirt-outline" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="add"
        options={{ title: 'Add', tabBarIcon: ({ color, size }) => <Ionicons name="add-circle-outline" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Profile', tabBarIcon: ({ color, size }) => <Ionicons name="person-outline" size={size} color={color} /> }}
      />
    </Tabs>
  )
}
