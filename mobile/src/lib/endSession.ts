type Logout = (
  options: { revokeToken: boolean },
  browserOptions: { preferEphemeralSession: boolean },
) => Promise<unknown>

// The SDK's logout always opens a web-auth session to Kinde's logout URL. An ephemeral
// session has its own cookie store, which suppresses iOS's "wants to use ... to sign in"
// prompt. It also means Kinde's browser cookie is not cleared, which is safe because the
// SDK's login always sends prompt=login, so the next person must enter their own credentials.
export function endSession(logout: Logout, options: { revokeToken: boolean }) {
  return logout(options, { preferEphemeralSession: true })
}
