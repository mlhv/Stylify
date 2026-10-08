import '../../global.css'

import { KindeAuthProvider, useKindeAuth } from '@kinde/expo'
import { Stack } from 'expo-router'

import { KINDE_CLIENT_ID, KINDE_DOMAIN } from '@/lib/config'

function RootStack() {
  const { isAuthenticated, isLoading } = useKindeAuth()
  if (isLoading) return null

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={isAuthenticated}>
        <Stack.Screen name="debug-auth" />
      </Stack.Protected>
      <Stack.Protected guard={!isAuthenticated}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
    </Stack>
  )
}

export default function RootLayout() {
  return (
    <KindeAuthProvider config={{ domain: KINDE_DOMAIN, clientId: KINDE_CLIENT_ID }}>
      <RootStack />
    </KindeAuthProvider>
  )
}
