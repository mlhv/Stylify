import { jwtVerify, type createLocalJWKSet, type createRemoteJWKSet } from 'jose'

export type KeyResolver = ReturnType<typeof createRemoteJWKSet> | ReturnType<typeof createLocalJWKSet>

export type BearerVerifierConfig = {
  issuer: string | undefined
  audience: string | undefined
  jwks: KeyResolver | undefined
}

export class BearerAuthError extends Error {}

// Verifies a Kinde access token sent by the mobile app. Every failure, including
// missing configuration and an unreachable key set, is a BearerAuthError so the
// caller can answer 401 without telling the client why.
export function createBearerVerifier(config: BearerVerifierConfig) {
  return async function verifyBearer(token: string): Promise<{ id: string }> {
    const { issuer, audience, jwks } = config
    if (!issuer || !audience || !jwks) {
      throw new BearerAuthError('Bearer auth is not configured (KINDE_DOMAIN / KINDE_AUDIENCE)')
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
      throw new BearerAuthError(`Token verification failed: ${reason}`)
    }

    if (!subject) {
      throw new BearerAuthError('Token has no subject')
    }
    return { id: subject }
  }
}
