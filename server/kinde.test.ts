import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test'
import { Hono } from 'hono'

// CI has no .env, so supply dummy configuration before ./kinde is imported.
process.env.KINDE_DOMAIN = 'https://example.kinde.com'
process.env.KINDE_CLIENT_ID = 'test-client-id'
process.env.KINDE_CLIENT_SECRET = 'test-client-secret'
process.env.KINDE_REDIRECT_URI = 'http://localhost:8080/api/callback'
process.env.KINDE_LOGOUT_REDIRECT_URI = 'http://localhost:5173'
delete process.env.KINDE_AUDIENCE

const { getUser } = await import('./kinde')

const app = new Hono().get('/protected', getUser, (c) => c.json({ ok: true }))

let errorSpy: ReturnType<typeof spyOn>

beforeEach(() => {
  errorSpy = spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  errorSpy.mockRestore()
})

describe('getUser wiring in kinde.ts', () => {
  test('no credentials: 401 Not authenticated', async () => {
    const res = await app.request('/protected')
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Not authenticated' })
  })

  // KINDE_AUDIENCE is unset above: the server still boots and serves cookie
  // requests, and a bearer request is "could not check", not "bad token".
  test('bearer token while KINDE_AUDIENCE is unset: 503 Auth unavailable', async () => {
    const res = await app.request('/protected', { headers: { Authorization: 'Bearer garbage' } })
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: 'Auth unavailable' })
  })
})
