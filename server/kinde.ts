import {createKindeServerClient, GrantType, type SessionManager} from "@kinde-oss/kinde-typescript-sdk";
import { type Context } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { createRemoteJWKSet } from "jose";
import { createBearerVerifier } from "./auth/bearer";
import { createGetUser, type AuthUser } from "./auth/getUser";

// Client for authorization code flow
export const kindeClient = createKindeServerClient(GrantType.AUTHORIZATION_CODE, {
  authDomain: process.env.KINDE_DOMAIN!,
  clientId: process.env.KINDE_CLIENT_ID!,
  clientSecret: process.env.KINDE_CLIENT_SECRET!,
  redirectURL: process.env.KINDE_REDIRECT_URI!,
  logoutRedirectURL: process.env.KINDE_LOGOUT_REDIRECT_URI!,
});

export const sessionManager = (c: Context): SessionManager => ({
  async getSessionItem(key: string) {
    const result = getCookie(c, key);
    return result;
  },
  async setSessionItem(key: string, value: unknown) {
    const cookieOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: "lax",
        } as const;
        if (typeof value === "string") {
            setCookie(c, key, value, cookieOptions);
        } else {
            setCookie(c, key, JSON.stringify(value), cookieOptions);
        }

  },
  async removeSessionItem(key: string) {
    deleteCookie(c, key);
  },
  async destroySession() {
    ['id_token', 'access_token', 'user', 'refresh_token'].forEach((key) => {
        deleteCookie(c, key);
    });
  }
});

// The key set is fetched on first use and cached. Built only when the domain is
// set: an unset KINDE_DOMAIN disables bearer auth. A value that is not a full URL
// still throws at import, as it already would for Kinde login.
const kindeDomain = (process.env.KINDE_DOMAIN ?? '').replace(/\/+$/, '');

const verifyBearer = createBearerVerifier({
  issuer: process.env.KINDE_DOMAIN,
  audience: process.env.KINDE_AUDIENCE,
  jwks: kindeDomain ? createRemoteJWKSet(new URL(`${kindeDomain}/.well-known/jwks`)) : undefined,
});

async function cookieAuth(c: Context): Promise<AuthUser | null> {
  const manager = sessionManager(c);
  const isAuthenticated = await kindeClient.isAuthenticated(manager);
  if (!isAuthenticated) {
    return null;
  }
  return kindeClient.getUserProfile(manager);
}

// Mobile sends a Kinde access token as a bearer token; the web app uses the
// httpOnly cookies set by /api/callback.
export const getUser = createGetUser({ verifyBearer, cookieAuth });
