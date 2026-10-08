import { beforeAll, describe, expect, test } from 'bun:test'
import { SignJWT, createLocalJWKSet, errors, exportJWK, generateKeyPair } from 'jose'
import { BearerAuthError, BearerUnavailableError, createBearerVerifier, type KeyResolver } from './bearer'

const ISSUER = 'https://example.kinde.com'
const AUDIENCE = 'https://stylify.space/api'
const SUBJECT = 'kp_abc123'

type KeyPair = Awaited<ReturnType<typeof generateKeyPair>>

let keys: KeyPair
let otherKeys: KeyPair
let jwks: KeyResolver

beforeAll(async () => {
  keys = await generateKeyPair('RS256')
  otherKeys = await generateKeyPair('RS256')
  const publicJwk = await exportJWK(keys.publicKey)
  jwks = createLocalJWKSet({ keys: [{ ...publicJwk, kid: 'test-key', alg: 'RS256' }] })
})

type TokenOptions = {
  issuer?: string
  audience?: string | string[]
  subject?: string | null
  expiresAt?: number | null
  signWith?: KeyPair['privateKey']
}

async function makeToken(options: TokenOptions = {}) {
  const now = Math.floor(Date.now() / 1000)
  const jwt = new SignJWT({})
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setIssuer(options.issuer ?? ISSUER)
    .setAudience(options.audience ?? [AUDIENCE])
    .setIssuedAt(now)
  if (options.subject !== null) jwt.setSubject(options.subject ?? SUBJECT)
  if (options.expiresAt !== null) jwt.setExpirationTime(options.expiresAt ?? now + 300)
  return jwt.sign(options.signWith ?? keys.privateKey)
}

function verifier(overrides: Partial<Parameters<typeof createBearerVerifier>[0]> = {}) {
  return createBearerVerifier({ issuer: ISSUER, audience: AUDIENCE, jwks, ...overrides })
}

describe('createBearerVerifier', () => {
  test('accepts a valid token and returns sub as id', async () => {
    expect(await verifier()(await makeToken())).toEqual({ id: SUBJECT })
  })

  test('accepts when the audience is one of several in the token', async () => {
    const token = await makeToken({ audience: ['something-else', AUDIENCE] })
    expect(await verifier()(token)).toEqual({ id: SUBJECT })
  })

  test('accepts when the configured issuer has a trailing slash', async () => {
    const verify = verifier({ issuer: `${ISSUER}/` })
    expect(await verify(await makeToken())).toEqual({ id: SUBJECT })
  })

  test('rejects an expired token', async () => {
    const token = await makeToken({ expiresAt: Math.floor(Date.now() / 1000) - 60 })
    await expect(verifier()(token)).rejects.toBeInstanceOf(BearerAuthError)
  })

  test('rejects a token with no expiry', async () => {
    const token = await makeToken({ expiresAt: null })
    await expect(verifier()(token)).rejects.toBeInstanceOf(BearerAuthError)
  })

  test('rejects a token with no subject', async () => {
    const token = await makeToken({ subject: null })
    await expect(verifier()(token)).rejects.toBeInstanceOf(BearerAuthError)
  })

  test('rejects the wrong issuer', async () => {
    const token = await makeToken({ issuer: 'https://evil.example.com' })
    await expect(verifier()(token)).rejects.toBeInstanceOf(BearerAuthError)
  })

  test('rejects the wrong audience', async () => {
    const token = await makeToken({ audience: ['some-other-api'] })
    await expect(verifier()(token)).rejects.toBeInstanceOf(BearerAuthError)
  })

  test('rejects a token signed by a different key', async () => {
    const token = await makeToken({ signWith: otherKeys.privateKey })
    await expect(verifier()(token)).rejects.toBeInstanceOf(BearerAuthError)
  })

  test('rejects a token signed with HS256', async () => {
    const now = Math.floor(Date.now() / 1000)
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer(ISSUER)
      .setAudience([AUDIENCE])
      .setSubject(SUBJECT)
      .setExpirationTime(now + 300)
      .sign(new TextEncoder().encode('a-guessed-shared-secret-of-enough-length'))
    await expect(verifier()(token)).rejects.toBeInstanceOf(BearerAuthError)
  })

  test('rejects a token signed with an algorithm other than RS256', async () => {
    const psKeys = await generateKeyPair('PS256')
    const psJwk = await exportJWK(psKeys.publicKey)
    // No `alg` on the JWK, so the key set itself would accept a PS256 signature.
    const psJwks = createLocalJWKSet({ keys: [{ ...psJwk, kid: 'ps-key' }] })
    const now = Math.floor(Date.now() / 1000)
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'PS256', kid: 'ps-key' })
      .setIssuer(ISSUER)
      .setAudience([AUDIENCE])
      .setSubject(SUBJECT)
      .setExpirationTime(now + 300)
      .sign(psKeys.privateKey)
    await expect(verifier({ jwks: psJwks })(token)).rejects.toBeInstanceOf(BearerAuthError)
  })

  test('rejects a token with an empty subject', async () => {
    const token = await makeToken({ subject: '' })
    await expect(verifier()(token)).rejects.toBeInstanceOf(BearerAuthError)
  })

  test('rejects garbage and the empty string', async () => {
    await expect(verifier()('not-a-jwt')).rejects.toBeInstanceOf(BearerAuthError)
    await expect(verifier()('')).rejects.toBeInstanceOf(BearerAuthError)
  })

  test('is unavailable, not rejected, when audience is not configured', async () => {
    const verify = verifier({ audience: undefined })
    await expect(verify(await makeToken())).rejects.toBeInstanceOf(BearerUnavailableError)
  })

  test('is unavailable when issuer or key set is not configured', async () => {
    const token = await makeToken()
    await expect(verifier({ issuer: undefined })(token)).rejects.toBeInstanceOf(BearerUnavailableError)
    await expect(verifier({ jwks: undefined })(token)).rejects.toBeInstanceOf(BearerUnavailableError)
  })

  test('is unavailable when the key set cannot be fetched', async () => {
    const failing = (async () => {
      throw new TypeError('fetch failed')
    }) as unknown as KeyResolver
    await expect(verifier({ jwks: failing })(await makeToken())).rejects.toBeInstanceOf(BearerUnavailableError)
  })

  test('is unavailable when the key set request times out or answers badly', async () => {
    for (const error of [
      new errors.JWKSTimeout(),
      new errors.JOSEError('Expected 200 OK from the JSON Web Key Set HTTP response'),
      new errors.JWKSInvalid('JSON Web Key Set malformed'),
    ]) {
      const failing = (async () => {
        throw error
      }) as unknown as KeyResolver
      await expect(verifier({ jwks: failing })(await makeToken())).rejects.toBeInstanceOf(BearerUnavailableError)
    }
  })

  test('a token signed by a key that is not in the key set is rejected, not unavailable', async () => {
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'RS256', kid: 'unknown-key' })
      .setIssuer(ISSUER)
      .setAudience([AUDIENCE])
      .setSubject(SUBJECT)
      .setExpirationTime(Math.floor(Date.now() / 1000) + 300)
      .sign(otherKeys.privateKey)
    const error = await verifier()(token).catch((e) => e)
    expect(error).toBeInstanceOf(BearerAuthError)
    expect(error).not.toBeInstanceOf(BearerUnavailableError)
  })

  test('a rejected token is never reported as unavailable', async () => {
    for (const token of ['not-a-jwt', '', await makeToken({ expiresAt: Math.floor(Date.now() / 1000) - 60 })]) {
      const error = await verifier()(token).catch((e) => e)
      expect(error).toBeInstanceOf(BearerAuthError)
      expect(error).not.toBeInstanceOf(BearerUnavailableError)
    }
  })
})
