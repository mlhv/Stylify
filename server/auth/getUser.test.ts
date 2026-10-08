import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test'
import { Hono } from 'hono'
import { BearerUnavailableError } from './bearer'
import { bearerToken, createGetUser, type AuthUser, type GetUserDeps } from './getUser'

const COOKIE_USER: AuthUser = { id: 'kp_cookie', given_name: 'Minh', family_name: 'Le', email: 'm@example.com', picture: null }

function setup(overrides: Partial<GetUserDeps> = {}) {
  const deps = {
    verifyBearer: mock(async (token: string): Promise<AuthUser> => {
      if (token === 'good') return { id: 'kp_bearer' }
      if (token === 'outage') throw new BearerUnavailableError('key set unreachable')
      throw new Error('bad token')
    }),
    cookieAuth: mock(async (): Promise<AuthUser | null> => COOKIE_USER),
    ...overrides,
  }
  const app = new Hono().get('/t', createGetUser(deps), (c) => c.json({ user: c.var.user }))
  const request = (headers: Record<string, string> = {}) => app.request('/t', { headers })
  return { deps, request }
}

describe('bearerToken', () => {
  test('is null when the header is missing or another scheme', () => {
    expect(bearerToken(undefined)).toBeNull()
    expect(bearerToken('')).toBeNull()
    expect(bearerToken('Basic abc123')).toBeNull()
    expect(bearerToken('Bearerish abc')).toBeNull()
  })

  test('returns the token, ignoring scheme case and extra spaces', () => {
    expect(bearerToken('Bearer abc.def.ghi')).toBe('abc.def.ghi')
    expect(bearerToken('bearer abc.def.ghi')).toBe('abc.def.ghi')
    expect(bearerToken('  Bearer   abc.def.ghi  ')).toBe('abc.def.ghi')
  })

  test('returns an empty string for a bearer header with no token', () => {
    expect(bearerToken('Bearer')).toBe('')
    expect(bearerToken('Bearer   ')).toBe('')
  })
})

describe('createGetUser', () => {
  let errorSpy: ReturnType<typeof spyOn>
  beforeEach(() => {
    errorSpy = spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    errorSpy.mockRestore()
  })

  test('valid bearer token: sets the user and skips cookies', async () => {
    const { deps, request } = setup()
    const res = await request({ Authorization: 'Bearer good' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ user: { id: 'kp_bearer' } })
    expect(deps.cookieAuth).not.toHaveBeenCalled()
  })

  test('lowercase scheme is still a bearer token', async () => {
    const { deps, request } = setup()
    const res = await request({ Authorization: 'bearer good' })
    expect(res.status).toBe(200)
    expect(deps.verifyBearer).toHaveBeenCalledWith('good')
  })

  test('invalid bearer token: 401 and no fallback to cookies', async () => {
    const { deps, request } = setup()
    const res = await request({ Authorization: 'Bearer bad' })
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Invalid token' })
    expect(deps.cookieAuth).not.toHaveBeenCalled()
  })

  test('bearer header with no token: 401 and no fallback to cookies', async () => {
    const { deps, request } = setup()
    const res = await request({ Authorization: 'Bearer' })
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Invalid token' })
    expect(deps.cookieAuth).not.toHaveBeenCalled()
  })

  test('bearer token that could not be checked: 503 and no fallback to cookies', async () => {
    const { deps, request } = setup()
    const res = await request({ Authorization: 'Bearer outage' })
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: 'Auth unavailable' })
    expect(deps.cookieAuth).not.toHaveBeenCalled()
  })

  test('no Authorization header: cookie path sets the full profile', async () => {
    const { deps, request } = setup()
    const res = await request()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ user: COOKIE_USER })
    expect(deps.verifyBearer).not.toHaveBeenCalled()
  })

  test('non-bearer scheme: cookie path', async () => {
    const { deps, request } = setup()
    const res = await request({ Authorization: 'Basic abc123' })
    expect(res.status).toBe(200)
    expect(deps.cookieAuth).toHaveBeenCalledTimes(1)
    expect(deps.verifyBearer).not.toHaveBeenCalled()
  })

  test('cookie path with no session: 401 Not authenticated', async () => {
    const { request } = setup({ cookieAuth: mock(async () => null) })
    const res = await request()
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Not authenticated' })
  })

  test('cookie path that throws: 401 Not authenticated', async () => {
    const { request } = setup({
      cookieAuth: mock(async (): Promise<AuthUser | null> => {
        throw new Error('kinde unavailable')
      }),
    })
    const res = await request()
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Not authenticated' })
  })
})
