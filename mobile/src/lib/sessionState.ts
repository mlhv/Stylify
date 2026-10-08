export type SessionState = 'pending' | 'signedIn' | 'signedOut'

// The Kinde provider sets isAuthenticated only when a network refresh succeeds at start, so
// offline it is false although the tokens are still on the device. A stored refresh token
// therefore counts as signed in; if Kinde has revoked it, the first API call's 401 ends the session.
// hasStoredToken is null until the storage check has run.
export function sessionState(input: {
  isLoading: boolean
  isAuthenticated: boolean
  hasStoredToken: boolean | null
}): SessionState {
  if (input.isLoading) return 'pending'
  if (input.isAuthenticated) return 'signedIn'
  if (input.hasStoredToken === null) return 'pending'
  return input.hasStoredToken ? 'signedIn' : 'signedOut'
}
