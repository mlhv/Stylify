// Maps the result of Kinde's refreshToken to the AuthFetchDeps.refresh contract:
// true = new token stored, false = session over, throw = could not ask.
//
// @kinde/js-utils never throws from refreshToken. Its fetch to /oauth2/token is in a
// try/catch that returns { success: false, error: `No access token received: ${e}` },
// so that prefix (with the colon) is the only sign of a network failure.
//
// Known limit: Kinde answering with any non-OK status (4xx or 5xx) returns
// "Failed to refresh token", which cannot be told apart, so it counts as session over.
export type RefreshResult = { success: boolean; error?: string }

export function refreshOutcome(result: RefreshResult): boolean {
  if (result.success) return true
  if (result.error?.startsWith('No access token received:')) throw new Error(result.error)
  return false
}
