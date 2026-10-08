import { useKindeAuth } from '@kinde/expo'
import { useEffect, useState } from 'react'

import { readHasStoredRefreshToken } from '@/lib/kindeSession'
import { sessionState, type SessionState } from '@/lib/sessionState'

// Signing out remounts the Kinde provider (and so everything under it), which starts this
// hook from null again; the stored-token answer is never carried across a sign-out.
export function useSessionState(): SessionState {
  const { isAuthenticated, isLoading } = useKindeAuth()
  const [hasStoredToken, setHasStoredToken] = useState<boolean | null>(null)

  useEffect(() => {
    if (isLoading || isAuthenticated) return
    let cancelled = false
    void readHasStoredRefreshToken().then((stored) => {
      if (!cancelled) setHasStoredToken(stored)
    })
    return () => {
      cancelled = true
    }
  }, [isLoading, isAuthenticated])

  return sessionState({ isLoading, isAuthenticated, hasStoredToken })
}
