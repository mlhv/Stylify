import '../../global.css'

import { Nunito_700Bold } from '@expo-google-fonts/nunito/700Bold'
import { Nunito_800ExtraBold } from '@expo-google-fonts/nunito/800ExtraBold'
import { Nunito_900Black } from '@expo-google-fonts/nunito/900Black'
import { useFonts } from '@expo-google-fonts/nunito/useFonts'
import { Ionicons } from '@expo/vector-icons'
import { KindeAuthProvider } from '@kinde/expo'
import { colors } from '@stylify/shared/brand'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { router, Stack } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { StatusBar } from 'expo-status-bar'
import { useEffect, useSyncExternalStore } from 'react'
import { Pressable, View } from 'react-native'

import { AuthBridge } from '@/components/AuthBridge'
import { ItemNotFoundError } from '@/lib/api'
import { ServerUnreachableError, SignedOutError } from '@/lib/authFetch'
import { authResetEpoch, subscribeAuthReset } from '@/lib/authReset'
import { KINDE_CLIENT_ID, KINDE_DOMAIN } from '@/lib/config'
import { useSessionState } from '@/lib/useSessionState'

// Held until Nunito is loaded, so no text is ever drawn in the system font.
void SplashScreen.preventAutoHideAsync()

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

// iOS 26's glass back button ignores the bar's tint colour, so the edit screen draws its own coral
// chevron. The swipe-back gesture is the native one and still works.
function BackChevron() {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Back to Closet"
      hitSlop={8}
      onPress={() => (router.canGoBack() ? router.back() : router.navigate('/'))}>
      <Ionicons name="chevron-back" size={26} color={colors.coral} />
    </Pressable>
  )
}

function RootStack() {
  const state = useSessionState()
  // Same colour as the sign-in screen, so the gap while the provider starts, or the stored
  // session is checked, is not seen.
  if (state === 'pending') return <View className="flex-1 bg-cream" />

  const signedIn = state === 'signedIn'
  return (
    <Stack screenOptions={{ contentStyle: { backgroundColor: colors.cream } }}>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="item/[id]"
          options={{
            title: 'Edit piece',
            headerStyle: { backgroundColor: colors.cream },
            headerShadowVisible: false,
            headerTitleStyle: { fontFamily: 'Nunito_900Black', fontSize: 18, color: colors.ink },
            headerTintColor: colors.coral,
            headerLeft: () => <BackChevron />,
          }}
        />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  )
}

export default function RootLayout() {
  // Signing out bumps this, which remounts the provider so it forgets the session.
  const epoch = useSyncExternalStore(subscribeAuthReset, authResetEpoch)
  const [fontsLoaded, fontError] = useFonts({ Nunito_700Bold, Nunito_800ExtraBold, Nunito_900Black })
  const fontsSettled = fontsLoaded || fontError !== null

  useEffect(() => {
    if (fontsSettled) void SplashScreen.hideAsync()
  }, [fontsSettled])

  // The splash screen is still up; a font that failed to load falls back to the system font.
  if (!fontsSettled) return null

  // The provider renders nothing while it restarts after sign-out; this cream view stays behind it
  // so the native (black) window never shows through.
  return (
    <View className="flex-1 bg-cream">
      {/* Light only: dark status bar text whatever the system appearance. */}
      <StatusBar style="dark" />
      <KindeAuthProvider key={epoch} config={{ domain: KINDE_DOMAIN, clientId: KINDE_CLIENT_ID }}>
        <QueryClientProvider client={queryClient}>
          <AuthBridge />
          <RootStack />
        </QueryClientProvider>
      </KindeAuthProvider>
    </View>
  )
}
