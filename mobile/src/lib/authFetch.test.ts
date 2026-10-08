import { describe, expect, mock, test } from 'bun:test'
import { createAuthFetch, ServerUnreachableError, SignedOutError, type AuthFetchDeps } from './authFetch'

const URL = 'https://stylify.space/api/wardrobe'

function setup(statuses: (number | Error)[], overrides: Partial<AuthFetchDeps> = {}) {
  let token: string | null = 'old'
  const queue = [...statuses]
  const fetchImpl = mock(async (_input: unknown, _init?: RequestInit) => {
    const next = queue.shift()
    if (next === undefined) throw new Error('unexpected fetch')
    if (next instanceof Error) throw next
    return new Response(null, { status: next })
  })
  const deps = {
    getAccessToken: mock(async () => token),
    refresh: mock(async () => {
      token = 'new'
      return true
    }),
    onSignedOut: mock(() => {}),
    fetchImpl: fetchImpl as unknown as typeof fetch,
    ...overrides,
  }
  const sentTokens = () =>
    fetchImpl.mock.calls.map(([, init]) => new Headers(init?.headers).get('Authorization'))
  return { authFetch: createAuthFetch(deps), deps, fetchImpl, sentTokens, setToken: (t: string | null) => (token = t) }
}

describe('createAuthFetch', () => {
  test('attaches the bearer token and keeps the caller\'s headers and body', async () => {
    const { authFetch, fetchImpl } = setup([200])
    const res = await authFetch(URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"a":1}' })
    expect(res.status).toBe(200)
    const init = fetchImpl.mock.calls[0][1]!
    const headers = new Headers(init.headers)
    expect(headers.get('Authorization')).toBe('Bearer old')
    expect(headers.get('Content-Type')).toBe('application/json')
    expect(init.method).toBe('POST')
    expect(init.body).toBe('{"a":1}')
  })

  test('401, then refresh, then success with the new token', async () => {
    const { authFetch, deps, sentTokens } = setup([401, 200])
    const res = await authFetch(URL)
    expect(res.status).toBe(200)
    expect(deps.refresh).toHaveBeenCalledTimes(1)
    expect(sentTokens()).toEqual(['Bearer old', 'Bearer new'])
    expect(deps.onSignedOut).not.toHaveBeenCalled()
  })

  test('401 twice signs out and refreshes only once', async () => {
    const { authFetch, deps } = setup([401, 401])
    await expect(authFetch(URL)).rejects.toBeInstanceOf(SignedOutError)
    expect(deps.refresh).toHaveBeenCalledTimes(1)
    expect(deps.onSignedOut).toHaveBeenCalledTimes(1)
  })

  test('a refused refresh signs out without retrying the request', async () => {
    const { authFetch, deps, fetchImpl } = setup([401], { refresh: mock(async () => false) })
    await expect(authFetch(URL)).rejects.toBeInstanceOf(SignedOutError)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(deps.onSignedOut).toHaveBeenCalledTimes(1)
  })

  test('a refresh that throws is "unreachable", not a sign-out', async () => {
    const { authFetch, deps } = setup([401], {
      refresh: mock(async (): Promise<boolean> => {
        throw new Error('network down')
      }),
    })
    await expect(authFetch(URL)).rejects.toBeInstanceOf(ServerUnreachableError)
    expect(deps.onSignedOut).not.toHaveBeenCalled()
  })

  test.each([502, 503, 504])('%i does not sign out or refresh', async (status) => {
    const { authFetch, deps } = setup([status])
    await expect(authFetch(URL)).rejects.toBeInstanceOf(ServerUnreachableError)
    expect(deps.refresh).not.toHaveBeenCalled()
    expect(deps.onSignedOut).not.toHaveBeenCalled()
  })

  test('a network failure does not sign out', async () => {
    const { authFetch, deps } = setup([new TypeError('Network request failed')])
    await expect(authFetch(URL)).rejects.toBeInstanceOf(ServerUnreachableError)
    expect(deps.onSignedOut).not.toHaveBeenCalled()
  })

  test('503 on the retry after a refresh does not sign out', async () => {
    const { authFetch, deps } = setup([401, 503])
    await expect(authFetch(URL)).rejects.toBeInstanceOf(ServerUnreachableError)
    expect(deps.onSignedOut).not.toHaveBeenCalled()
  })

  test('other statuses are returned to the caller untouched', async () => {
    const { authFetch, deps } = setup([404, 500])
    expect((await authFetch(URL)).status).toBe(404)
    expect((await authFetch(URL)).status).toBe(500)
    expect(deps.refresh).not.toHaveBeenCalled()
  })

  test('no stored token: refreshes first, then sends', async () => {
    const { authFetch, sentTokens, setToken } = setup([200])
    setToken(null)
    expect((await authFetch(URL)).status).toBe(200)
    expect(sentTokens()).toEqual(['Bearer new'])
  })

  test('no stored token and a refused refresh: signs out without calling the API', async () => {
    const { authFetch, deps, fetchImpl, setToken } = setup([], { refresh: mock(async () => false) })
    setToken(null)
    await expect(authFetch(URL)).rejects.toBeInstanceOf(SignedOutError)
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(deps.onSignedOut).toHaveBeenCalledTimes(1)
  })

  test('requests that get 401 together share one refresh', async () => {
    const { authFetch, deps } = setup([401, 401, 200, 200])
    const [a, b] = await Promise.all([authFetch(URL), authFetch(URL)])
    expect([a.status, b.status]).toEqual([200, 200])
    expect(deps.refresh).toHaveBeenCalledTimes(1)
  })

  test('concurrent 401s with a refused refresh sign out once and each still fails', async () => {
    const { authFetch, deps } = setup([401, 401, 401], { refresh: mock(async () => false) })
    const results = await Promise.allSettled([authFetch(URL), authFetch(URL), authFetch(URL)])
    for (const r of results) {
      expect(r.status).toBe('rejected')
      expect((r as PromiseRejectedResult).reason).toBeInstanceOf(SignedOutError)
    }
    expect(deps.refresh).toHaveBeenCalledTimes(1)
    expect(deps.onSignedOut).toHaveBeenCalledTimes(1)
  })

  test('a second session that ends signs out again', async () => {
    const { authFetch, deps } = setup([401, 401], { refresh: mock(async () => false) })
    await expect(authFetch(URL)).rejects.toBeInstanceOf(SignedOutError)
    await expect(authFetch(URL)).rejects.toBeInstanceOf(SignedOutError)
    expect(deps.onSignedOut).toHaveBeenCalledTimes(2)
  })
})
