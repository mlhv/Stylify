import { Text, View } from 'react-native'

// Proof that NativeWind styles render on Expo SDK 55. Replaced in Task 3.
export default function Proof() {
  return (
    <View className="flex-1 items-center justify-center gap-4 bg-emerald-600">
      <Text className="text-4xl font-bold text-white">Stylify</Text>
      <View className="rounded-full bg-white px-6 py-3">
        <Text className="font-semibold text-emerald-700">NativeWind works</Text>
      </View>
    </View>
  )
}
