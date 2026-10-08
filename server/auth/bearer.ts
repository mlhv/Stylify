import { errors, jwtVerify, type createLocalJWKSet, type createRemoteJWKSet } from 'jose'

export type KeyResolver = ReturnType<typeof createRemoteJWKSet> | ReturnType<typeof createLocalJWKSet>

export type BearerVerifierConfig = {
  issuer: string | undefined
  audience: string | undefined
  jwks: KeyResolver | undefined
}

// The token was checked and is not acceptable: the caller answers 401.
export class BearerAuthError extends Error {}

// The token could not be checked at all (missing configuration, or Kinde's key
// set could not be fetched): the caller answers 503, so the mobile app keeps
// the user signed in instead of treating an outage as a bad token.
export class BearerUnavailableError extends Error {}

// jose reports a rejected token with a specific JOSEError subclass. A key set it
// could not fetch surfaces as the generic base class, a timeout, an invalid key
// set, or a non-jose error thrown by fetch.
const KEY_SET_FAILURE_CODES = new Set(['ERR_JOSE_GENERIC', 'ERR_JWKS_TIMEOUT', 'ERR_JWKS_INVALID'])

function isTokenFault(cause: unknown): boolean {
  return cause instanceof errors.JOSEError && !KEY_SET_FAILURE_CODES.has(cause.code)
}

// Verifies a Kinde access token sent by the mobile app.
export function createBearerVerifier(config: BearerVerifierConfig) {
  return async function verifyBearer(token: string): Promise<{ id: string }> {
    const { issuer, audience, jwks } = config
    if (!issuer || !audience || !jwks) {
      throw new BearerUnavailableError('Bearer auth is not configured (KINDE_DOMAIN / KINDE_AUDIENCE)')
    }

    let subject: string | undefined
    try {
      const { payload } = await jwtVerify(token, jwks, {
        issuer: issuer.replace(/\/+$/, ''),
        audience,
        algorithms: ['RS256'],
        requiredClaims: ['exp', 'sub'],
      })
      subject = payload.sub
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : String(cause)
      if (isTokenFault(cause)) {
        throw new BearerAuthError(`Token verification failed: ${reason}`)
      }
      throw new BearerUnavailableError(`Token could not be verified: ${reason}`)
    }

    if (!subject) {
      throw new BearerAuthError('Token has no subject')
    }
    return { id: subject }
  }
}
