import { type Context } from 'hono'
import { createMiddleware } from 'hono/factory'
import { BearerUnavailableError } from './bearer'

// The cookie path supplies the full Kinde profile. The bearer path only has the
// token's subject, so everything except id is optional.
export type AuthUser = {
  id: string
  given_name?: string
  family_name?: string
  email?: string
  picture?: string | null
}

export type AuthEnv = {
  Variables: {
    user: AuthUser
  }
}

export type GetUserDeps = {
  verifyBearer: (token: string) => Promise<AuthUser>
  cookieAuth: (c: Context) => Promise<AuthUser | null>
}

// A bearer header that fails gets 401 when the token is bad and 503 when it
// could not be checked; neither falls back to cookies.
//
// null: not a bearer header, use cookies. A string (possibly empty): a bearer
// header, which must verify or the request is rejected.
export function bearerToken(header: string | undefined): string | null {
  if (!header) return null
  const match = /^Bearer(?:\s+(.*))?$/i.exec(header.trim())
  if (!match) return null
  return (match[1] ?? '').trim()
}

export function createGetUser(deps: GetUserDeps) {
  return createMiddleware<AuthEnv>(async (c, next) => {
    const token = bearerToken(c.req.header('Authorization'))

    if (token !== null) {
      try {
        c.set('user', await deps.verifyBearer(token))
      } catch (error) {
        console.error('Bearer auth failed:', error instanceof Error ? error.message : error)
        if (error instanceof BearerUnavailableError) {
          return c.json({ error: 'Auth unavailable' }, 503)
        }
        return c.json({ error: 'Invalid token' }, 401)
      }
      return next()
    }

    try {
      const user = await deps.cookieAuth(c)
      if (!user) {
        return c.json({ error: 'Not authenticated' }, 401)
      }
      c.set('user', user)
    } catch (error) {
      console.error(error)
      return c.json({ error: 'Not authenticated' }, 401)
    }
    return next()
  })
}
