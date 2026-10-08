export type SessionEnd = {
  readRefreshToken: () => Promise<string | null>
  // Removes the access, ID and refresh tokens from the device.
  clearLocal: () => Promise<void>
  // Makes the Kinde provider forget it was signed in.
  resetProvider: () => void
  revoke: (refreshToken: string) => Promise<void>
}

// Signs out without opening a browser. The SDK's own logout always opens a web-auth
// session (a sheet, plus iOS's "wants to use ... to sign in" prompt), so this does the
// local half itself. Kinde's browser cookie is left alone, which is safe because the
// SDK's login always sends prompt=login. The server-side revoke is best effort and
// never holds up the local sign-out.
export async function endSession(deps: SessionEnd): Promise<void> {
  let refreshToken: string | null = null
  try {
    refreshToken = await deps.readRefreshToken()
  } catch {
    // Without the token there is nothing to revoke; the sign-out still goes ahead.
  }
  await deps.clearLocal()
  deps.resetProvider()
  if (refreshToken) void deps.revoke(refreshToken).catch(() => {})
}
