export class ServerUnreachableError extends Error {
  constructor() {
    super("Can't reach the server")
    this.name = 'ServerUnreachableError'
  }
}

export class SignedOutError extends Error {
  constructor() {
    super('Signed out')
    this.name = 'SignedOutError'
  }
}

export type AuthFetchDeps = {
  getAccessToken: () => Promise<string | null>
  // true: a new token is stored. false: the session is over. Throws: could not ask.
  refresh: () => Promise<boolean>
  onSignedOut: () => void | Promise<void>
  fetchImpl?: typeof fetch
}

type FetchArgs = Parameters<typeof fetch>

// 502 and 504 are what API Gateway answers when the Lambda fails or times out.
const UNREACHABLE = new Set([502, 503, 504])

export function createAuthFetch(deps: AuthFetchDeps) {
  let refreshing: Promise<boolean> | null = null
  // Requests that share a refresh share its sign-out, so one ended session opens one logout.
  const signOuts = new WeakMap<Promise<boolean>, Promise<void>>()

  // Requests that fail together share one refresh.
  function refreshOnce() {
    refreshing ??= deps.refresh().finally(() => {
      refreshing = null
    })
    return refreshing
  }

  async function send(input: FetchArgs[0], init: FetchArgs[1], token: string) {
    const headers = new Headers(init?.headers)
    headers.set('Authorization', `Bearer ${token}`)
    let res: Response
    try {
      res = await (deps.fetchImpl ?? fetch)(input, { ...init, headers })
    } catch {
      throw new ServerUnreachableError()
    }
    if (UNREACHABLE.has(res.status)) throw new ServerUnreachableError()
    return res
  }

  async function signOut(round: Promise<boolean>): Promise<never> {
    let done = signOuts.get(round)
    if (!done) {
      done = Promise.resolve(deps.onSignedOut())
      signOuts.set(round, done)
    }
    await done
    throw new SignedOutError()
  }

  return async function authFetch(input: FetchArgs[0], init?: FetchArgs[1]): Promise<Response> {
    const token = await deps.getAccessToken()
    if (token) {
      const res = await send(input, init, token)
      if (res.status !== 401) return res
    }

    const round = refreshOnce()
    let refreshed: boolean
    try {
      refreshed = await round
    } catch {
      throw new ServerUnreachableError()
    }
    if (!refreshed) return signOut(round)

    const fresh = await deps.getAccessToken()
    if (!fresh) return signOut(round)
    const retry = await send(input, init, fresh)
    if (retry.status === 401) return signOut(round)
    return retry
  }
}
