import { useKindeAuth } from '@kinde/expo'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

import { setAuthHandlers } from '@/lib/api'
import { KINDE_CLIENT_ID, KINDE_DOMAIN } from '@/lib/config'
import { endSession } from '@/lib/endSession'
import { kindeSessionEnd } from '@/lib/kindeSession'
import { refreshOutcome } from '@/lib/refreshOutcome'
import { useSessionState } from '@/lib/useSessionState'

// Gives the API client the Kinde functions, and empties the query cache when the
// session ends so the next person to sign in never sees someone else's wardrobe.
// A session still stored on the device is not an ended one, so offline the cache is kept.
export function AuthBridge() {
  const kinde = useKindeAuth()
  const queryClient = useQueryClient()
  const state = useSessionState()

  useEffect(() => {
    setAuthHandlers({
      getAccessToken: kinde.getAccessToken,
      refresh: async () => {
        if (!KINDE_DOMAIN || !KINDE_CLIENT_ID) return false
        const result = await kinde.refreshToken({ domain: KINDE_DOMAIN, clientId: KINDE_CLIENT_ID })
        return refreshOutcome(result)
      },
      onSignedOut: async () => {
        queryClient.clear()
        await endSession(kindeSessionEnd)
      },
    })
    return () => setAuthHandlers(null)
  }, [kinde, queryClient])

  useEffect(() => {
    if (state === 'signedOut') queryClient.clear()
  }, [state, queryClient])

  return null
}
