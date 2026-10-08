import { clearRefreshTimer, getActiveStorage, getInsecureStorage, StorageKeys } from '@kinde/js-utils'

import { resetAuthProvider } from '@/lib/authReset'
import { KINDE_CLIENT_ID, KINDE_DOMAIN } from '@/lib/config'
import type { SessionEnd } from '@/lib/endSession'

// The Kinde SDK's storage, as it set it up (expo-secure-store on a device).
function storage() {
  const active = getActiveStorage()
  if (!active) throw new Error('Kinde storage is not ready')
  return active
}

type Store = NonNullable<ReturnType<typeof getActiveStorage>>

// Removes every token the SDK stored, and stops its pending refresh so it cannot fire after sign-out.
export async function clearLocalTokens(deps: {
  active: () => Store
  insecure: () => Store | null
  clearTimer: () => void
}) {
  deps.clearTimer()
  const active = deps.active()
  await active.removeItems(StorageKeys.accessToken, StorageKeys.idToken)
  await active.removeSessionItem(StorageKeys.refreshToken)
  // The SDK can also keep the refresh token in a second store; clear it if that is in use.
  const insecure = deps.insecure()
  if (insecure && insecure !== active) await insecure.removeSessionItem(StorageKeys.refreshToken)
}

// Whether the device holds a refresh token. The provider reports "signed in" only after a network
// refresh succeeds, so offline it says no even though the session is still on the device.
export async function hasStoredRefreshToken(deps: { active: () => Store | null }): Promise<boolean> {
  try {
    const token = await deps.active()?.getSessionItem(StorageKeys.refreshToken)
    return typeof token === 'string' && token.length > 0
  } catch {
    return false
  }
}

export const readHasStoredRefreshToken = () => hasStoredRefreshToken({ active: getActiveStorage })

// Re-check against @kinde/expo's logout (dist/index.mjs) when upgrading it.
export const kindeSessionEnd: SessionEnd = {
  readRefreshToken: async () => {
    const token = await storage().getSessionItem(StorageKeys.refreshToken)
    return typeof token === 'string' ? token : null
  },
  clearLocal: () => clearLocalTokens({ active: storage, insecure: getInsecureStorage, clearTimer: clearRefreshTimer }),
  resetProvider: resetAuthProvider,
  // RFC 7009 revoke for a public client. Never log the token.
  revoke: async (refreshToken) => {
    if (!KINDE_DOMAIN || !KINDE_CLIENT_ID) return
    await fetch(`${KINDE_DOMAIN}/oauth2/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: refreshToken, token_type_hint: 'refresh_token', client_id: KINDE_CLIENT_ID }).toString(),
    })
  },
}
