import '../../global.css'

import { KindeAuthProvider, useKindeAuth } from '@kinde/expo'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Stack } from 'expo-router'
import { useSyncExternalStore } from 'react'

import { AuthBridge } from '@/components/AuthBridge'
import { ItemNotFoundError } from '@/lib/api'
import { ServerUnreachableError, SignedOutError } from '@/lib/authFetch'
import { authResetEpoch, subscribeAuthReset } from '@/lib/authReset'
import { KINDE_CLIENT_ID, KINDE_DOMAIN } from '@/lib/config'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Retrying cannot fix a signed-out session or a deleted item, and "unreachable" gets its own retry button.
      retry: (failures, error) =>
        !(error instanceof SignedOutError) &&
        !(error instanceof ServerUnreachableError) &&
        !(error instanceof ItemNotFoundError) &&
        failures < 2,
    },
  },
})

function RootStack() {
  const { isAuthenticated, isLoading } = useKindeAuth()
  if (isLoading) return null

  return (
    <Stack>
      <Stack.Protected guard={isAuthenticated}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="item/[id]" options={{ title: 'Edit item' }} />
      </Stack.Protected>
      <Stack.Protected guard={!isAuthenticated}>
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  )
}

export default function RootLayout() {
  // Signing out bumps this, which remounts the provider so it forgets the session.
  const epoch = useSyncExternalStore(subscribeAuthReset, authResetEpoch)
  return (
    <KindeAuthProvider key={epoch} config={{ domain: KINDE_DOMAIN, clientId: KINDE_CLIENT_ID }}>
      <QueryClientProvider client={queryClient}>
        <AuthBridge />
        <RootStack />
      </QueryClientProvider>
    </KindeAuthProvider>
  )
}
