# Expo Mobile App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a native iPhone app for Stylify, at parity with the web app (sign in, wardrobe grid, add with a photo, edit, delete, profile), as a TestFlight build that uses the same API, database and Kinde users.

**Architecture:** `mobile/` is a fourth Bun workspace created from the Expo SDK 55 template. It calls the existing Hono API through the typed RPC client (`hc<ApiRoutes>`) with a small fetch wrapper that attaches a Kinde access token and applies the 401/503 rules. Auth comes from `@kinde/expo`; because its functions only exist inside React, a tiny `AuthBridge` component hands them to the module-level API client. Before the app exists, the API learns to answer 503 instead of 401 when it could not check a token.

**Tech Stack:** Expo SDK 55 (React Native 0.83.x, React 19.2.0), Expo Router, TanStack Query 5, TanStack Form 0.32 with `createItemSchema`, Hono RPC client, `@kinde/expo` 0.9.0, NativeWind 4.2.7 (Tailwind 3), `expo-image-picker`, `expo-image-manipulator`, `expo-file-system`, `bun test`, EAS Build.

**Spec:** `docs/superpowers/specs/2026-10-05-mobile-foundation-design.md` (Part 3 and `docs/mobile.md` from Part 4). Read it before starting; this plan argues from it.

> **2026-10-08:** This plan now targets Expo SDK 55 (React 19.2.0, React Native 0.83.x), because SDK 56 and 57 do not compile on Xcode 26.3. Every snippet below was typechecked against SDK 57 only: re-typecheck each task and apply "the SDK wins" against `https://docs.expo.dev/versions/v55.0.0/`. Task 2 was redone as "Task 2b" (see `.superpowers/sdd/2026-10-06-expo-mobile-app/task-2b-brief.md`); its bodies below are the SDK 57 originals.

## How this plan was checked

On 2026-10-06 every file in this plan was written into a throwaway copy of the repo and checked there. What that proved:

| Check | Result |
|---|---|
| `bun test ./server` with the 401/503 change | 33 pass |
| `bun test src` in `mobile/` (the fetch wrapper) | 14 pass |
| `bunx tsc --noEmit` in `mobile/`, with every screen in this plan | clean |
| `bunx expo export --platform ios` with NativeWind 4.2.7 configured | bundles (1658 modules) |
| One copy of `react` in the workspace | yes |
| Frontend typecheck and build, server typecheck, with `mobile` in the workspace | pass |
| Server image built with the Dockerfile in Task 2 | 57 top-level packages, no React Native, `GET /api/me` returns 401 |

What it did not prove: anything at runtime on a simulator or iPhone. Sign-in, NativeWind rendering, the camera, and the S3 upload have never run. Tasks 2, 3, 5 and 8 are where they first do.

**A finding that changes the spec's CI step.** The spec says `--filter` keeps React Native out of the server image. With the app's real dependencies it does not: the server's Kinde SDK depends on `@kinde/js-utils` 0.26.0, which declares `expo-secure-store` as an optional peer. Once `mobile/` puts `expo-secure-store` in the lockfile, Bun satisfies that peer and `--production --filter server` installs 711 packages, including Expo and React Native. Adding `--omit=peer` brings it back to 106 packages (57 top-level) and the image still boots. Task 2 uses `--omit=peer` in the Dockerfile and both workflows.

## Global Constraints

- **Ask Minh before every push to `main`.** A push that touches `server/`, `shared/`, `frontend/` or the root `package.json` deploys the live site. Work on a branch; reach `main` only with `git merge --ff-only`. Never force-push `main`.
- Rollback for a bad deploy: `git revert --no-edit <bad commits>` on `main`, then push (after telling Minh).
- Bun is `1.3.13` everywhere. Check `bun --version` first; stop if it differs.
- Expo SDK 55. React and `react-dom` stay exactly `19.2.0`; do not change the pin in `frontend/package.json` or root `overrides`. After any install, `find node_modules -path '*node_modules/react/package.json'` must print one line.
- App identity: `scheme` `stylify`, bundle identifier `space.stylify.app`, iOS deployment target `17.0`. Development builds only; Expo Go is not used. Do not turn the New Architecture off.
- iPhone only, but do not add iOS-only libraries.
- Kinde audience: `https://stylify.space/api`. It must equal `KINDE_AUDIENCE` on the server.
- API base URL: `https://stylify.space`, or `EXPO_PUBLIC_API_URL` when set.
- The 401/503 rule in the app: 401 → refresh once and retry once → sign out if that fails. 502, 503, 504 or a network failure → stay signed in and show "Can't reach the server" with a retry.
- Call the API only through the typed client in `mobile/src/lib/api.ts`. The one exception is the temporary screen in Task 3, deleted in Task 4.
- Install Expo packages with `bunx expo install <package>` from `mobile/`, never `bun add`, so versions match the SDK. Other packages: `bun add` from `mobile/`. After any `package.json` change run `bun install` at the repo root and commit `bun.lockb`.
- `@tanstack/react-form` and `@tanstack/zod-form-adapter` stay on the same minor (0.32) as the web app.
- Expo APIs change every SDK. Before changing any Expo code in this plan, read the versioned page under `https://docs.expo.dev/versions/v55.0.0/`. If the SDK disagrees with a snippet here, the SDK wins: make the smallest change that typechecks, and note it in the commit message.
- `mobile/ios` and `mobile/android` are generated and ignored by git. Never edit them by hand; change `app.json`.
- Never print or commit `.env` values. `mobile/.env.local` is ignored by git. Kinde's domain and client ID are not secrets (they ship in the app), but keep them out of the repo anyway.
- Local development uses the production database and image bucket. Delete every test item afterwards.
- Verify every task with, from `mobile/`: `bunx tsc --noEmit`, `bun test src`, `bunx expo export --platform ios`. All three must pass before a commit.
- NativeWind fallback: if Task 2's proof fails, remove NativeWind (steps are in Task 2) and from then on write each `className` as an equivalent `StyleSheet.create` style. Do not debug the NativeWind toolchain.

## Review Focus

Conditions the spec implies that are most likely to hurt a person using the app. Each is pinned by the check named.

1. **Someone signs out and a different person signs in on the same phone.** They must never see the first person's wardrobe. `AuthBridge` clears the query cache when the session ends. (Task 8 checklist, step 9.)
2. **Several requests get 401 at once** (the wardrobe and the item count load together after a token expires). There must be one refresh, not one per request, or the second refresh can invalidate the first. (Task 4, test "requests that get 401 together share one refresh".)
3. **Kinde is unreachable when a refresh is needed.** The user must stay signed in. The wrapper treats a refresh that throws as "unreachable". Known limit: whether `@kinde/expo` throws or returns `success: false` when offline is not known; if it returns `false`, an offline refresh still signs the user out. (Task 4, test "a refresh that throws"; Task 8, step 10 observes the real behaviour.)
4. **The photo uploads but saving the item fails.** The form must stay filled in, and pressing the button again must not upload the photo a second time. (Task 5, `uploaded` state in `add.tsx`; Task 8, step 6.)
5. **An item is deleted on the web while the phone still shows it.** Opening it must show an error with a way back, not a crash or an endless spinner. (Task 6, `ErrorState` on a failed `getItem`; Task 8, step 8.)

---

## File Structure

| File | Responsibility |
|---|---|
| `server/auth/bearer.ts` (modify) | Verify a token; say whether a failure is "bad token" or "could not check" |
| `server/auth/getUser.ts` (modify) | Map those to 401 and 503 |
| `server/Dockerfile`, `.dockerignore`, `.github/workflows/*.yml`, root `package.json` (modify) | Let `mobile` join the workspace without changing what the web and API deploys install |
| `mobile/app.json`, `mobile/package.json`, `mobile/tsconfig.json` | App identity, dependencies, path aliases |
| `mobile/babel.config.js`, `metro.config.js`, `tailwind.config.js`, `global.css`, `nativewind-env.d.ts`, `src/css.d.ts` | NativeWind |
| `mobile/src/lib/config.ts` | Build-time settings |
| `mobile/src/lib/authFetch.ts` (+ test) | The 401/503 rules, with no dependency on React or Kinde |
| `mobile/src/lib/api.ts` | Typed client, `queryOptions`, and the handover point for auth functions |
| `mobile/src/lib/upload.ts` | Re-encode to JPEG; upload to S3 |
| `mobile/src/lib/photo.ts` | Permissions and the camera/library picker |
| `mobile/src/components/AuthBridge.tsx` | Connect Kinde to the API client; clear the cache on sign-out |
| `mobile/src/components/ErrorState.tsx` | Error text and a retry button |
| `mobile/src/components/ItemForm.tsx` | The form shared by Add and Edit |
| `mobile/src/app/_layout.tsx` | Providers and the signed-in/signed-out guard |
| `mobile/src/app/sign-in.tsx`, `(tabs)/_layout.tsx`, `(tabs)/index.tsx`, `(tabs)/add.tsx`, `(tabs)/profile.tsx`, `item/[id].tsx` | Screens |
| `mobile/eas.json` | TestFlight build profile |
| `docs/mobile.md`, `AGENTS.md` | Documentation |

Branches: Task 1 on `fix/bearer-503`; Task 2 on `feat/mobile-scaffold`; Tasks 3 to 10 on `feat/mobile-app`.

---

### Task 1: Answer 503 when a bearer token could not be checked

**Files:**
- Modify: `server/auth/bearer.ts`, `server/auth/getUser.ts`
- Test: `server/auth/bearer.test.ts`, `server/auth/getUser.test.ts`, `server/kinde.test.ts`

**Interfaces:**
- Produces: `BearerUnavailableError` (exported from `server/auth/bearer.ts`, not a subclass of `BearerAuthError`). `getUser` answers `503 {"error":"Auth unavailable"}` for it and `401 {"error":"Invalid token"}` for every other bearer failure.

- [ ] **Step 1: Branch**

```bash
git checkout main && git pull --ff-only && git checkout -b fix/bearer-503
bun --version   # 1.3.13
```

- [ ] **Step 2: Write the failing tests**

Apply these three changes.

`server/auth/bearer.test.ts`:

```diff
--- a/server/auth/bearer.test.ts
+++ b/server/auth/bearer.test.ts
@@ -1,6 +1,6 @@
 import { beforeAll, describe, expect, test } from 'bun:test'
-import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose'
-import { BearerAuthError, createBearerVerifier, type KeyResolver } from './bearer'
+import { SignJWT, createLocalJWKSet, errors, exportJWK, generateKeyPair } from 'jose'
+import { BearerAuthError, BearerUnavailableError, createBearerVerifier, type KeyResolver } from './bearer'
 
 const ISSUER = 'https://example.kinde.com'
 const AUDIENCE = 'https://stylify.space/api'
@@ -126,21 +126,55 @@
     await expect(verifier()('')).rejects.toBeInstanceOf(BearerAuthError)
   })
 
-  test('rejects when audience is not configured', async () => {
+  test('is unavailable, not rejected, when audience is not configured', async () => {
     const verify = verifier({ audience: undefined })
-    await expect(verify(await makeToken())).rejects.toBeInstanceOf(BearerAuthError)
+    await expect(verify(await makeToken())).rejects.toBeInstanceOf(BearerUnavailableError)
   })
 
-  test('rejects when issuer or key set is not configured', async () => {
+  test('is unavailable when issuer or key set is not configured', async () => {
     const token = await makeToken()
-    await expect(verifier({ issuer: undefined })(token)).rejects.toBeInstanceOf(BearerAuthError)
-    await expect(verifier({ jwks: undefined })(token)).rejects.toBeInstanceOf(BearerAuthError)
+    await expect(verifier({ issuer: undefined })(token)).rejects.toBeInstanceOf(BearerUnavailableError)
+    await expect(verifier({ jwks: undefined })(token)).rejects.toBeInstanceOf(BearerUnavailableError)
   })
 
-  test('rejects when the key set cannot be loaded', async () => {
+  test('is unavailable when the key set cannot be fetched', async () => {
     const failing = (async () => {
-      throw new Error('network down')
+      throw new TypeError('fetch failed')
     }) as unknown as KeyResolver
-    await expect(verifier({ jwks: failing })(await makeToken())).rejects.toBeInstanceOf(BearerAuthError)
+    await expect(verifier({ jwks: failing })(await makeToken())).rejects.toBeInstanceOf(BearerUnavailableError)
   })
+
+  test('is unavailable when the key set request times out or answers badly', async () => {
+    for (const error of [
+      new errors.JWKSTimeout(),
+      new errors.JOSEError('Expected 200 OK from the JSON Web Key Set HTTP response'),
+      new errors.JWKSInvalid('JSON Web Key Set malformed'),
+    ]) {
+      const failing = (async () => {
+        throw error
+      }) as unknown as KeyResolver
+      await expect(verifier({ jwks: failing })(await makeToken())).rejects.toBeInstanceOf(BearerUnavailableError)
+    }
+  })
+
+  test('a token signed by a key that is not in the key set is rejected, not unavailable', async () => {
+    const token = await new SignJWT({})
+      .setProtectedHeader({ alg: 'RS256', kid: 'unknown-key' })
+      .setIssuer(ISSUER)
+      .setAudience([AUDIENCE])
+      .setSubject(SUBJECT)
+      .setExpirationTime(Math.floor(Date.now() / 1000) + 300)
+      .sign(otherKeys.privateKey)
+    const error = await verifier()(token).catch((e) => e)
+    expect(error).toBeInstanceOf(BearerAuthError)
+    expect(error).not.toBeInstanceOf(BearerUnavailableError)
+  })
+
+  test('a rejected token is never reported as unavailable', async () => {
+    for (const token of ['not-a-jwt', '', await makeToken({ expiresAt: Math.floor(Date.now() / 1000) - 60 })]) {
+      const error = await verifier()(token).catch((e) => e)
+      expect(error).toBeInstanceOf(BearerAuthError)
+      expect(error).not.toBeInstanceOf(BearerUnavailableError)
+    }
+  })
 })
```

`server/auth/getUser.test.ts`:

```diff
--- a/server/auth/getUser.test.ts
+++ b/server/auth/getUser.test.ts
@@ -1,5 +1,6 @@
 import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test'
 import { Hono } from 'hono'
+import { BearerUnavailableError } from './bearer'
 import { bearerToken, createGetUser, type AuthUser, type GetUserDeps } from './getUser'
 
 const COOKIE_USER: AuthUser = { id: 'kp_cookie', given_name: 'Minh', family_name: 'Le', email: 'm@example.com', picture: null }
@@ -8,6 +9,7 @@
   const deps = {
     verifyBearer: mock(async (token: string): Promise<AuthUser> => {
       if (token === 'good') return { id: 'kp_bearer' }
+      if (token === 'outage') throw new BearerUnavailableError('key set unreachable')
       throw new Error('bad token')
     }),
     cookieAuth: mock(async (): Promise<AuthUser | null> => COOKIE_USER),
@@ -78,6 +80,14 @@
     expect(deps.cookieAuth).not.toHaveBeenCalled()
   })
 
+  test('bearer token that could not be checked: 503 and no fallback to cookies', async () => {
+    const { deps, request } = setup()
+    const res = await request({ Authorization: 'Bearer outage' })
+    expect(res.status).toBe(503)
+    expect(await res.json()).toEqual({ error: 'Auth unavailable' })
+    expect(deps.cookieAuth).not.toHaveBeenCalled()
+  })
+
   test('no Authorization header: cookie path sets the full profile', async () => {
     const { deps, request } = setup()
     const res = await request()
```

`server/kinde.test.ts` (this file deletes `KINDE_AUDIENCE` before importing, so its bearer request is now "could not check"):

```diff
--- a/server/kinde.test.ts
+++ b/server/kinde.test.ts
@@ -30,9 +30,11 @@
     expect(await res.json()).toEqual({ error: 'Not authenticated' })
   })
 
-  test('garbage bearer token: 401 Invalid token', async () => {
+  // KINDE_AUDIENCE is unset above: the server still boots and serves cookie
+  // requests, and a bearer request is "could not check", not "bad token".
+  test('bearer token while KINDE_AUDIENCE is unset: 503 Auth unavailable', async () => {
     const res = await app.request('/protected', { headers: { Authorization: 'Bearer garbage' } })
-    expect(res.status).toBe(401)
-    expect(await res.json()).toEqual({ error: 'Invalid token' })
+    expect(res.status).toBe(503)
+    expect(await res.json()).toEqual({ error: 'Auth unavailable' })
   })
 })
```

- [ ] **Step 3: Run the tests and see them fail**

Run: `bun test ./server`
Expected: FAIL. `bearer.test.ts` cannot import `BearerUnavailableError` (`SyntaxError: Export named 'BearerUnavailableError' not found`).

- [ ] **Step 4: Implement**

`server/auth/bearer.ts`:

```diff
--- a/server/auth/bearer.ts
+++ b/server/auth/bearer.ts
@@ -1,4 +1,4 @@
-import { jwtVerify, type createLocalJWKSet, type createRemoteJWKSet } from 'jose'
+import { errors, jwtVerify, type createLocalJWKSet, type createRemoteJWKSet } from 'jose'
 
 export type KeyResolver = ReturnType<typeof createRemoteJWKSet> | ReturnType<typeof createLocalJWKSet>
 
@@ -8,16 +8,29 @@
   jwks: KeyResolver | undefined
 }
 
+// The token was checked and is not acceptable: the caller answers 401.
 export class BearerAuthError extends Error {}
 
-// Verifies a Kinde access token sent by the mobile app. Every failure, including
-// missing configuration and an unreachable key set, is a BearerAuthError so the
-// caller can answer 401 without telling the client why.
+// The token could not be checked at all (missing configuration, or Kinde's key
+// set could not be fetched): the caller answers 503, so the mobile app keeps
+// the user signed in instead of treating an outage as a bad token.
+export class BearerUnavailableError extends Error {}
+
+// jose reports a rejected token with a specific JOSEError subclass. A key set it
+// could not fetch surfaces as the generic base class, a timeout, an invalid key
+// set, or a non-jose error thrown by fetch.
+const KEY_SET_FAILURE_CODES = new Set(['ERR_JOSE_GENERIC', 'ERR_JWKS_TIMEOUT', 'ERR_JWKS_INVALID'])
+
+function isTokenFault(cause: unknown): boolean {
+  return cause instanceof errors.JOSEError && !KEY_SET_FAILURE_CODES.has(cause.code)
+}
+
+// Verifies a Kinde access token sent by the mobile app.
 export function createBearerVerifier(config: BearerVerifierConfig) {
   return async function verifyBearer(token: string): Promise<{ id: string }> {
     const { issuer, audience, jwks } = config
     if (!issuer || !audience || !jwks) {
-      throw new BearerAuthError('Bearer auth is not configured (KINDE_DOMAIN / KINDE_AUDIENCE)')
+      throw new BearerUnavailableError('Bearer auth is not configured (KINDE_DOMAIN / KINDE_AUDIENCE)')
     }
 
     let subject: string | undefined
@@ -31,7 +44,10 @@
       subject = payload.sub
     } catch (cause) {
       const reason = cause instanceof Error ? cause.message : String(cause)
-      throw new BearerAuthError(`Token verification failed: ${reason}`)
+      if (isTokenFault(cause)) {
+        throw new BearerAuthError(`Token verification failed: ${reason}`)
+      }
+      throw new BearerUnavailableError(`Token could not be verified: ${reason}`)
     }
 
     if (!subject) {
```

`server/auth/getUser.ts`:

```diff
--- a/server/auth/getUser.ts
+++ b/server/auth/getUser.ts
@@ -1,5 +1,6 @@
 import { type Context } from 'hono'
 import { createMiddleware } from 'hono/factory'
+import { BearerUnavailableError } from './bearer'
 
 // The cookie path supplies the full Kinde profile. The bearer path only has the
 // token's subject, so everything except id is optional.
@@ -22,6 +23,9 @@
   cookieAuth: (c: Context) => Promise<AuthUser | null>
 }
 
+// A bearer header that fails gets 401 when the token is bad and 503 when it
+// could not be checked; neither falls back to cookies.
+//
 // null: not a bearer header, use cookies. A string (possibly empty): a bearer
 // header, which must verify or the request is rejected.
 export function bearerToken(header: string | undefined): string | null {
@@ -40,6 +44,9 @@
         c.set('user', await deps.verifyBearer(token))
       } catch (error) {
         console.error('Bearer auth failed:', error instanceof Error ? error.message : error)
+        if (error instanceof BearerUnavailableError) {
+          return c.json({ error: 'Auth unavailable' }, 503)
+        }
         return c.json({ error: 'Invalid token' }, 401)
       }
       return next()
```

Why the allow-list is of key-set failures and not of token failures: `jose` gives every rejected token its own `JOSEError` subclass with its own `code`. A key set it could not fetch surfaces as the plain base class (`ERR_JOSE_GENERIC`, "Expected 200 OK…"), `JWKSTimeout`, `JWKSInvalid`, or whatever `fetch` threw. An unknown key ID (`ERR_JWKS_NO_MATCHING_KEY`) stays a 401: `jose` already refetches the key set once before reporting it.

- [ ] **Step 5: Run the tests and typechecks**

```bash
bun test ./server                    # 33 pass, 0 fail
(cd server && bunx tsc --noEmit)     # no output
(cd frontend && bun run typecheck)   # no errors (it also checks server files)
```

- [ ] **Step 6: Check the container, as `AGENTS.md` requires for backend changes**

```bash
docker build -t stylify-server:local -f server/Dockerfile .
docker run --rm -d --name stylify-local -p 8081:8080 --env-file .env stylify-server:local
curl -s -o /dev/null -w '%{http_code}\n' --retry 10 --retry-connrefused --retry-delay 1 http://localhost:8081/api/me   # 401
curl -s -w ' %{http_code}\n' -H 'Authorization: Bearer garbage' http://localhost:8081/api/me   # {"error":"Invalid token"} 401
docker stop stylify-local
```

If Docker is not running: `orb start`.

- [ ] **Step 7: Commit**

```bash
git add server/auth server/kinde.test.ts
git commit -m "fix(server): answer 503, not 401, when a bearer token could not be checked"
```

- [ ] **Step 8: Deploy (needs Minh's OK)**

Ask Minh: "Task 1 is ready. Pushing it deploys the API. OK to push?" After a yes:

```bash
git checkout main && git merge --ff-only fix/bearer-503 && git push origin main
gh run watch $(gh run list --workflow deploy-backend.yml --limit 1 --json databaseId -q '.[0].databaseId') --exit-status
curl -s -o /dev/null -w '%{http_code}\n' https://stylify.space          # 200
curl -s -o /dev/null -w '%{http_code}\n' https://stylify.space/api/me   # 401
curl -s -w ' %{http_code}\n' -H 'Authorization: Bearer garbage' https://stylify.space/api/me   # {"error":"Invalid token"} 401
```

The 503 path cannot be provoked on the live site without breaking Kinde; the unit tests are its proof. Ask Minh to log in on the web and load the wardrobe once, to confirm the cookie path is unchanged.

---

### Task 2: Scaffold `mobile/` as a workspace, with the CI changes and the NativeWind proof

**Before starting:** Xcode must be installed (`xcodebuild -version` prints a version, and `xcrun simctl list devices` lists iPhones). If not, stop and ask Minh to install Xcode from the App Store, open it once, and install the iOS platform.

**Files:**
- Create: `mobile/` (from the template), `mobile/babel.config.js`, `mobile/metro.config.js`, `mobile/tailwind.config.js`, `mobile/global.css`, `mobile/nativewind-env.d.ts`, `mobile/src/css.d.ts`, `mobile/src/app/_layout.tsx`, `mobile/src/app/index.tsx`
- Modify: root `package.json`, `bun.lockb`, `server/Dockerfile`, `.dockerignore`, `.github/workflows/deploy-frontend.yml`, `.github/workflows/deploy-backend.yml`, `AGENTS.md`

**Interfaces:**
- Produces: a workspace named `mobile` whose `@/*` alias is `mobile/src/*` and whose `@server/*` alias is `server/*`. `mobile/global.css` is imported once, by `src/app/_layout.tsx`. Scripts: `bun run typecheck`, `bun run test`, `bun run ios`.

- [ ] **Step 1: Branch and create the app**

```bash
git checkout main && git pull --ff-only && git checkout -b feat/mobile-scaffold
bunx create-expo-app@latest mobile --template default --no-install
rm -rf mobile/.git
grep '"expo":' mobile/package.json    # must be ~57.x; if it is a newer SDK, stop and tell Minh (the React pin is tied to SDK 57)
```

- [ ] **Step 2: Remove the template's demo code**

```bash
cd mobile
rm -rf src/components src/hooks src/constants src/app/explore.tsx src/app/index.tsx src/global.css \
       scripts .vscode .claude LICENSE README.md assets/images/tabIcons
cd ..
```

Keep `mobile/AGENTS.md` (the template's Expo rules) and `mobile/.gitignore` (it already ignores `/ios`, `/android`, `.expo/`, `dist/`, `expo-env.d.ts` and `.env*.local`).

- [ ] **Step 3: Join the workspace and install dependencies**

Root `package.json`:

```diff
--- a/package.json
+++ b/package.json
@@ -2,7 +2,7 @@
   "name": "fashionapp",
   "module": "server/index.ts",
   "type": "module",
-  "workspaces": ["frontend", "server", "shared"],
+  "workspaces": ["frontend", "server", "shared", "mobile"],
   "overrides": {
     "react": "19.2.3",
     "react-dom": "19.2.3"
```

```bash
bun install
cd mobile
bunx expo install expo-auth-session expo-secure-store expo-crypto expo-image-picker expo-image-manipulator expo-file-system
bun add @kinde/expo@0.9.0 'hono@^4.6.9' 'zod@^3.23.8' '@stylify/shared@workspace:*' \
        '@tanstack/react-query@^5.56.2' '@tanstack/react-form@^0.32.0' '@tanstack/zod-form-adapter@^0.32.0' nativewind@4.2.7
bun add -d 'tailwindcss@^3.4.11' @types/bun
cd ..
```

- [ ] **Step 4: Set the manifest, app identity and aliases**

`mobile/package.json` should end up like this (patch versions under `~57.0.x` may be newer; keep what `expo install` chose). Replace the `scripts` block exactly:

```json
{
  "name": "mobile",
  "main": "expo-router/entry",
  "version": "1.0.0",
  "dependencies": {
    "@expo/ui": "~57.0.22",
    "@kinde/expo": "0.9.0",
    "@stylify/shared": "workspace:*",
    "@tanstack/react-form": "^0.32.0",
    "@tanstack/react-query": "^5.56.2",
    "@tanstack/zod-form-adapter": "^0.32.0",
    "expo": "~57.0.27",
    "expo-auth-session": "~57.0.14",
    "expo-constants": "~57.0.21",
    "expo-crypto": "~57.0.3",
    "expo-device": "~57.0.2",
    "expo-file-system": "~57.0.7",
    "expo-font": "~57.0.4",
    "expo-glass-effect": "~57.0.4",
    "expo-image": "~57.0.5",
    "expo-image-manipulator": "~57.0.21",
    "expo-image-picker": "~57.0.20",
    "expo-linking": "~57.0.12",
    "expo-router": "~57.0.25",
    "expo-secure-store": "~57.0.4",
    "expo-splash-screen": "~57.0.9",
    "expo-status-bar": "~57.0.1",
    "expo-symbols": "~57.0.3",
    "expo-system-ui": "~57.0.4",
    "expo-web-browser": "~57.0.3",
    "hono": "^4.6.9",
    "nativewind": "4.2.7",
    "react": "19.2.3",
    "react-dom": "19.2.3",
    "react-native": "0.86.3",
    "react-native-gesture-handler": "~2.32.0",
    "react-native-reanimated": "4.5.1",
    "react-native-safe-area-context": "~5.7.0",
    "react-native-screens": "~4.26.0",
    "react-native-web": "~0.21.0",
    "react-native-worklets": "0.10.1",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/bun": "^1.4.2",
    "@types/react": "~19.2.2",
    "tailwindcss": "^3.4.11",
    "typescript": "~6.0.3"
  },
  "scripts": {
    "start": "expo start",
    "ios": "expo run:ios",
    "typecheck": "tsc --noEmit",
    "test": "bun test src"
  },
  "private": true
}
```

`mobile/app.json`:

```json
{
  "expo": {
    "name": "Stylify",
    "slug": "stylify",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/images/icon.png",
    "scheme": "stylify",
    "userInterfaceStyle": "automatic",
    "ios": {
      "icon": "./assets/expo.icon",
      "bundleIdentifier": "space.stylify.app",
      "deploymentTarget": "17.0"
    },
    "android": {
      "adaptiveIcon": {
        "backgroundColor": "#E6F4FE",
        "foregroundImage": "./assets/images/android-icon-foreground.png",
        "backgroundImage": "./assets/images/android-icon-background.png",
        "monochromeImage": "./assets/images/android-icon-monochrome.png"
      },
      "predictiveBackGestureEnabled": false
    },
    "web": {
      "bundler": "metro",
      "output": "static",
      "favicon": "./assets/images/favicon.png"
    },
    "plugins": [
      "expo-router",
      [
        "expo-splash-screen",
        {
          "backgroundColor": "#208AEF",
          "image": "./assets/images/splash-icon.png",
          "imageWidth": 76
        }
      ],
      "expo-secure-store",
      [
        "expo-image-picker",
        {
          "cameraPermission": "Stylify uses the camera to photograph your clothes.",
          "photosPermission": "Stylify uses your photo library to add pictures of your clothes."
        }
      ]
    ],
    "experiments": {
      "typedRoutes": true,
      "reactCompiler": true
    }
  }
}
```

`mobile/tsconfig.json`:

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "paths": {
      "@/*": [
        "./src/*"
      ],
      "@/assets/*": [
        "./assets/*"
      ],
      "@server/*": [
        "../server/*"
      ]
    }
  },
  "include": [
    "**/*.ts",
    "**/*.tsx",
    ".expo/types/**/*.ts",
    "expo-env.d.ts",
    "nativewind-env.d.ts"
  ]
}
```

- [ ] **Step 5: Configure NativeWind**

Read `https://www.nativewind.dev/docs/getting-started/installation` first; if it differs from the files below for v4, follow the page.

`mobile/global.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

`mobile/tailwind.config.js`:

```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: { extend: {} },
  plugins: [],
}
```

`mobile/babel.config.js`:

```js
module.exports = function (api) {
  api.cache(true)
  return {
    presets: [['babel-preset-expo', { jsxImportSource: 'nativewind' }], 'nativewind/babel'],
  }
}
```

`mobile/metro.config.js`:

```js
const { getDefaultConfig } = require('expo/metro-config')
const { withNativeWind } = require('nativewind/metro')

const config = getDefaultConfig(__dirname)

module.exports = withNativeWind(config, { input: './global.css' })
```

`mobile/nativewind-env.d.ts`:

```ts
/// <reference types="nativewind/types" />
```

`mobile/src/css.d.ts` (TypeScript 6 rejects a side-effect import of a file it has no declaration for):

```ts
declare module '*.css'
```

- [ ] **Step 6: Write the proof screen**

`mobile/src/app/_layout.tsx`:

```tsx
import '../../global.css'

import { Stack } from 'expo-router'

export default function RootLayout() {
  return <Stack screenOptions={{ headerShown: false }} />
}
```

`mobile/src/app/index.tsx`:

```tsx
import { Text, View } from 'react-native'

// Proof that NativeWind styles render on Expo SDK 57. Replaced in Task 3.
export default function Proof() {
  return (
    <View className="flex-1 items-center justify-center gap-4 bg-emerald-600">
      <Text className="text-4xl font-bold text-white">Stylify</Text>
      <View className="rounded-full bg-white px-6 py-3">
        <Text className="font-semibold text-emerald-700">NativeWind works</Text>
      </View>
    </View>
  )
}
```

- [ ] **Step 7: Static checks**

```bash
bun install
find node_modules -path '*node_modules/react/package.json'   # exactly one line
cd mobile && bunx tsc --noEmit && bunx expo export --platform ios && cd ..
```

Expected: `tsc` prints nothing; the export ends with `Exported: dist`.

- [ ] **Step 8: Run it in the simulator (the NativeWind proof)**

```bash
cd mobile && bunx expo run:ios
```

The first build takes several minutes. Then take a screenshot and look at it:

```bash
xcrun simctl io booted screenshot /tmp/stylify-proof.png
```

**Pass:** a green screen, white bold "Stylify", and a white rounded pill reading "NativeWind works".
**Fail:** an unstyled screen (black text on white, top-left), a red error screen naming `nativewind` or `react-native-css-interop`, or a build error from them.

On a fail, apply the fallback and repeat Steps 7 and 8:

```bash
cd mobile && bun remove nativewind tailwindcss
rm babel.config.js metro.config.js tailwind.config.js global.css nativewind-env.d.ts src/css.d.ts
```

Remove `"nativewind-env.d.ts"` from `tsconfig.json`, remove the `global.css` import from `_layout.tsx`, and rewrite `index.tsx` with `StyleSheet.create` (same colours and layout). Tell Minh the fallback was taken.

- [ ] **Step 9: Keep React Native out of the web and API deploys**

`server/Dockerfile`:

```diff
--- a/server/Dockerfile
+++ b/server/Dockerfile
@@ -8,11 +8,15 @@
 
 # Bun needs the manifest of every workspace listed in the root package.json,
 # or it fails with "Workspace not found". --filter installs only server's deps.
+# --omit=peer is required: the Kinde SDK has an optional peer (expo-secure-store)
+# that mobile/ puts in the lockfile, and without it Expo and React Native are
+# installed into this image.
 COPY package.json bun.lockb ./
 COPY server/package.json ./server/
 COPY shared/package.json ./shared/
 COPY frontend/package.json ./frontend/
-RUN bun install --production --frozen-lockfile --filter server
+COPY mobile/package.json ./mobile/
+RUN bun install --production --frozen-lockfile --omit=peer --filter server
 
 COPY server/ ./server/
 COPY shared/ ./shared/
```

`.dockerignore`:

```diff
--- a/.dockerignore
+++ b/.dockerignore
@@ -7,3 +7,7 @@
 README.md
 docs/
 models/
+mobile/.expo
+mobile/ios
+mobile/android
+mobile/dist
```

`.github/workflows/deploy-frontend.yml`, the install step:

```yaml
      # mobile/ shares this lockfile. --filter skips its dependencies; --omit=peer
      # stops an optional peer of the server's Kinde SDK (expo-secure-store) from
      # pulling in Expo and React Native. The frontend typecheck reads server types.
      - name: Install dependencies
        run: bun install --frozen-lockfile --omit=peer --filter frontend --filter server
```

`.github/workflows/deploy-backend.yml`, the install step:

```yaml
      # mobile/ shares this lockfile. --filter skips its dependencies; --omit=peer
      # stops an optional peer of the Kinde SDK (expo-secure-store) from pulling
      # in Expo and React Native.
      - name: Install dependencies
        run: bun install --frozen-lockfile --omit=peer --filter server
```

- [ ] **Step 10: Prove the two workflow installs locally**

```bash
clean() { rm -rf node_modules frontend/node_modules server/node_modules shared/node_modules mobile/node_modules; }

clean && bun install --frozen-lockfile --omit=peer --filter frontend --filter server
ls node_modules | grep -c -E '^(react-native|expo)'      # 0
(cd frontend && bun run typecheck && bun run build)      # both pass

clean && bun install --frozen-lockfile --omit=peer --filter server
ls node_modules | grep -c -E '^(react-native|expo)'      # 0
bun test ./server                                        # 33 pass

clean && bun install                                     # restore the full install
```

- [ ] **Step 11: Prove the image**

```bash
docker build -t stylify-server:local -f server/Dockerfile .
docker run --rm stylify-server:local sh -c 'ls node_modules | wc -l; ls node_modules | grep -c -E "^(react-native|expo|react)$"'   # about 57, then 0
docker run --rm -d --name stylify-local -p 8081:8080 --env-file .env stylify-server:local
curl -s -o /dev/null -w '%{http_code}\n' --retry 10 --retry-connrefused --retry-delay 1 http://localhost:8081/api/me   # 401
docker stop stylify-local
```

A count in the hundreds on the first line means `--omit=peer` is missing.

- [ ] **Step 12: Update `AGENTS.md`**

- In the intro, replace "A native iPhone app (Expo, in `mobile/`) is planned;" with "A native iPhone app (Expo, in `mobile/`) is being built;".
- In the Layout block add the line `mobile/     Expo SDK 57 iPhone app. Not deployed by CI.` and change "`server`, `frontend` and `shared` are Bun workspaces" to "`server`, `frontend`, `shared` and `mobile` are Bun workspaces".
- Add this rule under "Rules that are easy to break":

```markdown
- **Server and web installs need `--omit=peer` as well as `--filter`.** The server's Kinde SDK has an optional peer, `expo-secure-store`, which `mobile/` puts in the lockfile. Without `--omit=peer`, `--filter server` installs Expo and React Native (about 700 packages instead of about 100). The Dockerfile and both deploy workflows use it. After changing any of them, check `docker run --rm <image> sh -c 'ls node_modules | wc -l'` prints about 57.
```

- [ ] **Step 13: Commit**

```bash
git add package.json bun.lockb mobile server/Dockerfile .dockerignore .github/workflows AGENTS.md
git status --short | grep -E 'mobile/(ios|android|dist|\.expo)' && echo "STOP: generated files staged"
git commit -m "feat(mobile): scaffold the Expo app as a workspace; keep React Native out of web and API installs"
```

- [ ] **Step 14: Deploy (needs Minh's OK)**

This commit edits the root `package.json` and both workflow files, so it redeploys the web app and the API. Ask Minh: "Task 2 is ready. Pushing it redeploys both the site and the API with no behaviour change. OK to push?" After a yes:

```bash
git checkout main && git merge --ff-only feat/mobile-scaffold && git push origin main
gh run list --limit 2      # watch both to green with: gh run watch <id> --exit-status
curl -s -o /dev/null -w '%{http_code}\n' https://stylify.space          # 200
curl -s -o /dev/null -w '%{http_code}\n' https://stylify.space/api/me   # 401
```

Then ask Minh to do the browser check from `AGENTS.md`: log in, create an item, edit it, delete it, log out.

---

### Task 3: Kinde sign-in and the token check

This task is a gate. If the token check fails, stop and report; do not start Task 4.

**Files:**
- Create: `mobile/src/lib/config.ts`, `mobile/src/app/sign-in.tsx`, `mobile/src/app/debug-auth.tsx` (temporary), `mobile/.env.local` (not committed)
- Modify: `mobile/src/app/_layout.tsx`
- Delete: `mobile/src/app/index.tsx`

**Interfaces:**
- Produces: `API_URL`, `KINDE_DOMAIN`, `KINDE_CLIENT_ID`, `KINDE_AUDIENCE` from `@/lib/config`. Route `/sign-in`.

- [ ] **Step 1: Branch**

```bash
git checkout main && git pull --ff-only && git checkout -b feat/mobile-app
```

- [ ] **Step 2: Config**

`mobile/src/lib/config.ts`:

```ts
// EXPO_PUBLIC_ values are read at build time and ship inside the app; none of them is a secret.
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://stylify.space'
export const KINDE_DOMAIN = process.env.EXPO_PUBLIC_KINDE_DOMAIN
export const KINDE_CLIENT_ID = process.env.EXPO_PUBLIC_KINDE_CLIENT_ID
// Must equal KINDE_AUDIENCE on the server, or every request is a 401.
export const KINDE_AUDIENCE = 'https://stylify.space/api'
```

- [ ] **Step 3: Sign-in screen, showing the redirect URI for now**

`mobile/src/app/sign-in.tsx`:

```tsx
import { useKindeAuth } from '@kinde/expo'
import { useState } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'

import { KINDE_AUDIENCE } from '@/lib/config'

export default function SignIn() {
  const kinde = useKindeAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function signIn() {
    setBusy(true)
    setError(null)
    try {
      const result = await kinde.login({ audience: KINDE_AUDIENCE })
      if (!result.success) setError(result.errorMessage)
    } catch {
      setError('Could not open sign-in. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <View className="flex-1 items-center justify-center gap-6 bg-white p-6">
      <Text className="text-4xl font-bold">Stylify</Text>
      <Text className="text-center text-neutral-600">Your wardrobe, on your phone.</Text>
      <Pressable className="w-full items-center rounded-lg bg-neutral-900 py-4" disabled={busy} onPress={signIn}>
        {busy ? <ActivityIndicator color="white" /> : <Text className="font-semibold text-white">Sign in</Text>}
      </Pressable>
      {error ? <Text className="text-center text-red-600">{error}</Text> : null}
    </View>
  )
}
```

For this task only, add two lines so Minh can read the real redirect URI. Add the import `import { makeRedirectUri } from 'expo-auth-session'` and, as the last child of the outer `View`:

```tsx
      <Text selectable className="text-xs text-neutral-500">Redirect URI: {makeRedirectUri()}</Text>
```

- [ ] **Step 4: Temporary token-check screen**

`mobile/src/app/debug-auth.tsx`:

```tsx
import { useKindeAuth } from '@kinde/expo'
import { useEffect, useState } from 'react'
import { Pressable, ScrollView, Text } from 'react-native'

import { API_URL, KINDE_AUDIENCE } from '@/lib/config'

// TEMPORARY (Task 3 only): proves the token check in the spec, then is deleted in Task 4.
type Report = { aud: string; audOk: boolean; sub: string; meStatus: number; meUserId: string }

function decodePayload(token: string): { aud?: string | string[]; sub?: string } {
  const part = token.split('.')[1] ?? ''
  const base64 = part.replace(/-/g, '+').replace(/_/g, '/')
  return JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')))
}

export default function DebugAuth() {
  const kinde = useKindeAuth()
  const [report, setReport] = useState<Report | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function run() {
      const token = await kinde.getAccessToken()
      if (!token) throw new Error('No access token stored')
      const payload = decodePayload(token)
      const aud = ([] as string[]).concat(payload.aud ?? [])
      const res = await fetch(`${API_URL}/api/me`, { headers: { Authorization: `Bearer ${token}` } })
      const body = res.ok ? ((await res.json()) as { user?: { id?: string } }) : null
      setReport({
        aud: aud.join(', ') || '(none)',
        audOk: aud.includes(KINDE_AUDIENCE),
        sub: payload.sub ?? '(none)',
        meStatus: res.status,
        meUserId: body?.user?.id ?? '(none)',
      })
    }
    run().catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [kinde])

  return (
    <ScrollView className="flex-1 bg-white" contentContainerClassName="gap-3 p-6 pt-20">
      <Text className="text-2xl font-bold">Token check</Text>
      {error ? <Text className="text-red-600">{error}</Text> : null}
      {report ? (
        <>
          <Text selectable>aud: {report.aud}</Text>
          <Text className={report.audOk ? 'text-green-700' : 'text-red-600'}>
            {report.audOk ? 'PASS: audience present' : `FAIL: audience ${KINDE_AUDIENCE} missing`}
          </Text>
          <Text selectable>sub: {report.sub}</Text>
          <Text selectable>GET /api/me: {report.meStatus}</Text>
          <Text selectable>/api/me user id: {report.meUserId}</Text>
        </>
      ) : (
        <Text>Checking…</Text>
      )}
      <Pressable className="mt-6 items-center rounded-lg bg-neutral-900 py-4" onPress={() => void kinde.logout({ revokeToken: true })}>
        <Text className="font-semibold text-white">Sign out</Text>
      </Pressable>
    </ScrollView>
  )
}
```

- [ ] **Step 5: Root layout with the auth guard**

Delete `mobile/src/app/index.tsx`. Replace `mobile/src/app/_layout.tsx`:

```tsx
import '../../global.css'

import { KindeAuthProvider, useKindeAuth } from '@kinde/expo'
import { Stack } from 'expo-router'

import { KINDE_CLIENT_ID, KINDE_DOMAIN } from '@/lib/config'

function RootStack() {
  const { isAuthenticated, isLoading } = useKindeAuth()
  if (isLoading) return null

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={isAuthenticated}>
        <Stack.Screen name="debug-auth" />
      </Stack.Protected>
      <Stack.Protected guard={!isAuthenticated}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
    </Stack>
  )
}

export default function RootLayout() {
  return (
    <KindeAuthProvider config={{ domain: KINDE_DOMAIN, clientId: KINDE_CLIENT_ID }}>
      <RootStack />
    </KindeAuthProvider>
  )
}
```

- [ ] **Step 6: Static checks**

```bash
cd mobile && bunx tsc --noEmit && bunx expo export --platform ios
```

- [ ] **Step 7: Minh creates the Kinde application**

Give Minh these steps:

1. In the Kinde dashboard, same business as the web app: Settings → Applications → Add application → name "Stylify iOS", type "Front-end and mobile".
2. In its APIs tab: switch on "Stylify API" (audience `https://stylify.space/api`). Save.
3. Create `mobile/.env.local` with two lines, using the application's domain and client ID:

```
EXPO_PUBLIC_KINDE_DOMAIN=https://<subdomain>.kinde.com
EXPO_PUBLIC_KINDE_CLIENT_ID=<client id>
```

The domain must be the same value as `KINDE_DOMAIN` in the root `.env`. Do not print either file.

- [ ] **Step 8: Run the app and register the real redirect URI**

```bash
cd mobile && bunx expo run:ios      # new native modules were added in Task 2, so this rebuilds
xcrun simctl io booted screenshot /tmp/stylify-signin.png
```

The sign-in screen shows "Redirect URI: …". Read the exact string from the screenshot. It is expected to be `stylify://`, but use whatever is shown. Minh adds that string to both "Allowed callback URLs" and "Allowed logout redirect URLs" in the "Stylify iOS" application's Details, and saves.

If `.env.local` is created or changed while the dev server is running, restart it with `bunx expo start --dev-client --clear` and press `i`: `EXPO_PUBLIC_` values are read at bundle time.

- [ ] **Step 9: The token check (Minh signs in)**

Minh signs in on the simulator with the same account they use on the web. The "Token check" screen must show:

| Line | Required |
|---|---|
| `PASS: audience present` | yes |
| `GET /api/me: 200` | yes |
| `/api/me user id` equals `sub` | yes |
| `/api/me user id` equals the web user ID | yes |

For the last row, Minh opens `https://stylify.space/api/me` in a browser where they are logged in and compares `user.id` (it looks like `kp_…`) with the screen.

Outcomes:
- All four pass: continue.
- Audience missing or `/api/me` is 401: confirm Step 7.2 was saved and sign in again. If it still fails, stop and report; the spec's fallback is to request the token with `expo-auth-session` directly.
- `/api/me` is 503: the server could not reach Kinde or `KINDE_AUDIENCE` is unset on the Lambda; stop and report.
- IDs differ between web and mobile: stop. Web and mobile would have separate wardrobes and the design needs rework.

- [ ] **Step 10: Commit**

```bash
git add mobile
git status --short | grep -F '.env' && echo "STOP: env file staged"
git commit -m "feat(mobile): Kinde sign-in and a temporary token check"
```

---

### Task 4: API client and the wardrobe grid

**Files:**
- Create: `mobile/src/lib/authFetch.ts`, `mobile/src/lib/authFetch.test.ts`, `mobile/src/lib/api.ts`, `mobile/src/components/AuthBridge.tsx`, `mobile/src/components/ErrorState.tsx`, `mobile/src/app/(tabs)/_layout.tsx`, `mobile/src/app/(tabs)/index.tsx`, and placeholders `mobile/src/app/(tabs)/add.tsx`, `mobile/src/app/(tabs)/profile.tsx`, `mobile/src/app/item/[id].tsx`
- Modify: `mobile/src/app/_layout.tsx`, `mobile/src/app/sign-in.tsx`
- Delete: `mobile/src/app/debug-auth.tsx`

**Interfaces:**
- Consumes: `API_URL`, `KINDE_DOMAIN`, `KINDE_CLIENT_ID` from `@/lib/config`.
- Produces, from `@/lib/authFetch`: `createAuthFetch(deps: AuthFetchDeps): (input, init?) => Promise<Response>`, `ServerUnreachableError`, `SignedOutError`, and `type AuthFetchDeps = { getAccessToken: () => Promise<string | null>; refresh: () => Promise<boolean>; onSignedOut: () => void | Promise<void>; fetchImpl?: typeof fetch }`.
- Produces, from `@/lib/api`: `setAuthHandlers`, `api`, `type Item`, `getAllItemsQueryOptions` (key `['get-all-items']`, data `{ items: Item[] }`), `getTotalClothesQueryOptions` (key `['get-total-clothes']`, data `{ total: number }`), `getItemQueryOptions(id: number)` (data `{ item: Item }`), `getCurrentUser()`, `getSignedURL()`, `createItem({ value })`, `editItem({ id, value })`, `deleteItem({ id })`.
- Produces, from `@/components/ErrorState`: `ErrorState({ error, onRetry })` and `errorMessage(error: unknown): string`.

- [ ] **Step 1: Write the failing test**

`mobile/src/lib/authFetch.test.ts`:

```ts
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
})
```

- [ ] **Step 2: Run it and see it fail**

Run: `cd mobile && bun test src`
Expected: FAIL, `Cannot find module './authFetch'`.

- [ ] **Step 3: Implement the wrapper**

`mobile/src/lib/authFetch.ts`:

```ts
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

  async function signOut(): Promise<never> {
    await deps.onSignedOut()
    throw new SignedOutError()
  }

  return async function authFetch(input: FetchArgs[0], init?: FetchArgs[1]): Promise<Response> {
    const token = await deps.getAccessToken()
    if (token) {
      const res = await send(input, init, token)
      if (res.status !== 401) return res
    }

    let refreshed: boolean
    try {
      refreshed = await refreshOnce()
    } catch {
      throw new ServerUnreachableError()
    }
    if (!refreshed) return signOut()

    const fresh = await deps.getAccessToken()
    if (!fresh) return signOut()
    const retry = await send(input, init, fresh)
    if (retry.status === 401) return signOut()
    return retry
  }
}
```

- [ ] **Step 4: Run the test and see it pass**

Run: `cd mobile && bun test src`
Expected: 14 pass, 0 fail.

- [ ] **Step 5: The typed client**

`mobile/src/lib/api.ts`:

```ts
import { hc } from 'hono/client'
import type { ApiRoutes } from '@server/app'
import { queryOptions } from '@tanstack/react-query'
import type { createItem as CreateItem } from '@stylify/shared'

import { createAuthFetch, type AuthFetchDeps } from './authFetch'
import { API_URL } from './config'

type AuthHandlers = Omit<AuthFetchDeps, 'fetchImpl'>

// The Kinde functions only exist inside React (useKindeAuth). AuthBridge hands
// them over here so this module-level client can use them.
let handlers: AuthHandlers | null = null

export function setAuthHandlers(next: AuthHandlers | null) {
  handlers = next
}

const authFetch = createAuthFetch({
  getAccessToken: async () => (handlers ? handlers.getAccessToken() : null),
  refresh: async () => (handlers ? handlers.refresh() : false),
  onSignedOut: async () => {
    await handlers?.onSignedOut()
  },
})

const client = hc<ApiRoutes>(API_URL, { fetch: authFetch })

export const api = client.api

async function getAllItems() {
  const res = await api.wardrobe.$get()
  if (!res.ok) throw new Error('Could not load your wardrobe')
  return res.json()
}

// The routes that can answer c.notFound() lose their response type in the RPC
// client, so their results are asserted to this shape instead.
export type Item = Awaited<ReturnType<typeof getAllItems>>['items'][number]

export const getAllItemsQueryOptions = queryOptions({
  queryKey: ['get-all-items'],
  queryFn: getAllItems,
  staleTime: 1000 * 60 * 5,
})

async function getTotalClothes() {
  const res = await api.wardrobe['total-items'].$get()
  if (!res.ok) throw new Error('Could not load the item count')
  return res.json()
}

export const getTotalClothesQueryOptions = queryOptions({
  queryKey: ['get-total-clothes'],
  queryFn: getTotalClothes,
  staleTime: 1000 * 60 * 5,
})

export async function getCurrentUser() {
  const res = await api.me.$get()
  if (!res.ok) throw new Error('Could not load the current user')
  return res.json()
}

export async function getItem({ id }: { id: number }) {
  const res = await api.wardrobe[':id{[0-9]+}'].$get({ param: { id: id.toString() } })
  if (!res.ok) throw new Error('Could not load this item')
  return (await res.json()) as { item: Item }
}

export const getItemQueryOptions = (id: number) =>
  queryOptions({
    queryKey: ['get-item', id],
    queryFn: () => getItem({ id }),
    staleTime: 1000 * 60 * 5,
  })

export async function getSignedURL() {
  const res = await api['signed-url'].$get()
  if (!res.ok) throw new Error('Could not start the upload')
  return res.json()
}

export async function createItem({ value }: { value: CreateItem }) {
  const res = await api.wardrobe.$post({ json: value })
  if (!res.ok) throw new Error('Could not save the item')
  return res.json()
}

export async function editItem({ id, value }: { id: number; value: CreateItem }) {
  const res = await api.wardrobe[':id{[0-9]+}'].$put({ param: { id: id.toString() }, json: value })
  if (!res.ok) throw new Error('Could not save the item')
  return (await res.json()) as Item
}

export async function deleteItem({ id }: { id: number }) {
  const res = await api.wardrobe[':id{[0-9]+}'].$delete({ param: { id: id.toString() } })
  if (!res.ok) throw new Error('Could not delete the item')
}
```

`ApiRoutes` must be a type-only import (`import type`): the server's code must never enter the app bundle.

- [ ] **Step 6: AuthBridge and ErrorState**

`mobile/src/components/AuthBridge.tsx`:

```tsx
import { useKindeAuth } from '@kinde/expo'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

import { setAuthHandlers } from '@/lib/api'
import { KINDE_CLIENT_ID, KINDE_DOMAIN } from '@/lib/config'

// Gives the API client the Kinde functions, and empties the query cache when the
// session ends so the next person to sign in never sees someone else's wardrobe.
export function AuthBridge() {
  const kinde = useKindeAuth()
  const queryClient = useQueryClient()

  useEffect(() => {
    setAuthHandlers({
      getAccessToken: kinde.getAccessToken,
      refresh: async () => {
        if (!KINDE_DOMAIN || !KINDE_CLIENT_ID) return false
        const result = await kinde.refreshToken({ domain: KINDE_DOMAIN, clientId: KINDE_CLIENT_ID })
        return result.success
      },
      onSignedOut: async () => {
        queryClient.clear()
        await kinde.logout({ revokeToken: false })
      },
    })
    return () => setAuthHandlers(null)
  }, [kinde, queryClient])

  useEffect(() => {
    if (!kinde.isAuthenticated) queryClient.clear()
  }, [kinde.isAuthenticated, queryClient])

  return null
}
```

Note: `kinde.logout()` clears the stored tokens first and then opens a browser sheet to end the Kinde session. On a forced sign-out the user therefore sees that sheet briefly before the sign-in screen. That is accepted for this version.

`mobile/src/components/ErrorState.tsx`:

```tsx
import { Pressable, Text, View } from 'react-native'

import { ServerUnreachableError } from '@/lib/authFetch'

export function errorMessage(error: unknown): string {
  if (error instanceof ServerUnreachableError) return "Can't reach the server. Check your connection and try again."
  if (error instanceof Error) return error.message
  return 'Something went wrong'
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <View className="flex-1 items-center justify-center gap-4 p-6">
      <Text className="text-center text-base text-neutral-700">{errorMessage(error)}</Text>
      <Pressable className="rounded-lg bg-neutral-900 px-5 py-3" onPress={onRetry}>
        <Text className="font-semibold text-white">Try again</Text>
      </Pressable>
    </View>
  )
}
```

- [ ] **Step 7: Final root layout and sign-in screen**

Delete `mobile/src/app/debug-auth.tsx`. In `mobile/src/app/sign-in.tsx`, remove the `makeRedirectUri` import and the "Redirect URI" line added in Task 3, so the file matches the listing in Task 3 Step 3 exactly.

`mobile/src/app/_layout.tsx`:

```tsx
import '../../global.css'

import { KindeAuthProvider, useKindeAuth } from '@kinde/expo'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Stack } from 'expo-router'

import { AuthBridge } from '@/components/AuthBridge'
import { ServerUnreachableError, SignedOutError } from '@/lib/authFetch'
import { KINDE_CLIENT_ID, KINDE_DOMAIN } from '@/lib/config'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Retrying cannot fix a signed-out session, and "unreachable" gets its own retry button.
      retry: (failures, error) =>
        !(error instanceof SignedOutError) && !(error instanceof ServerUnreachableError) && failures < 2,
    },
  },
})

function RootStack() {
  const { isAuthenticated, isLoading } = useKindeAuth()
  if (isLoading) return null

  return (
    <Stack>
      <Stack.Protected guard={isAuthenticated}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="item/[id]" options={{ title: 'Edit item' }} />
      </Stack.Protected>
      <Stack.Protected guard={!isAuthenticated}>
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  )
}

export default function RootLayout() {
  return (
    <KindeAuthProvider config={{ domain: KINDE_DOMAIN, clientId: KINDE_CLIENT_ID }}>
      <QueryClientProvider client={queryClient}>
        <AuthBridge />
        <RootStack />
      </QueryClientProvider>
    </KindeAuthProvider>
  )
}
```

- [ ] **Step 8: Tabs and the wardrobe grid**

`mobile/src/app/(tabs)/_layout.tsx`:

```tsx
import { Tabs } from 'expo-router'

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: '#171717' }}>
      <Tabs.Screen name="index" options={{ title: 'Wardrobe' }} />
      <Tabs.Screen name="add" options={{ title: 'Add' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  )
}
```

`mobile/src/app/(tabs)/index.tsx`:

```tsx
import { useQuery } from '@tanstack/react-query'
import { Image } from 'expo-image'
import { Link } from 'expo-router'
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native'

import { ErrorState } from '@/components/ErrorState'
import { getAllItemsQueryOptions, type Item } from '@/lib/api'

function ItemCard({ item }: { item: Item }) {
  return (
    <Link href={{ pathname: '/item/[id]', params: { id: item.id } }} asChild>
      <Pressable className="m-1.5 flex-1" accessibilityLabel={`Edit ${item.name ?? 'item'}`}>
        <Image
          source={{ uri: item.imageUrl }}
          style={{ width: '100%', aspectRatio: 1, borderRadius: 12, backgroundColor: '#e5e5e5' }}
          contentFit="cover"
        />
        <Text className="mt-1 font-medium" numberOfLines={1}>
          {item.name}
        </Text>
        <Text className="text-sm text-neutral-500" numberOfLines={1}>
          {[item.type, item.size, item.color].filter(Boolean).join(' · ')}
        </Text>
      </Pressable>
    </Link>
  )
}

function Skeletons() {
  return (
    <View className="flex-row flex-wrap p-1.5">
      {Array.from({ length: 6 }, (_, i) => (
        <View key={i} className="w-1/2 p-1.5">
          <View className="aspect-square w-full rounded-xl bg-neutral-200" />
          <View className="mt-2 h-4 w-2/3 rounded bg-neutral-200" />
        </View>
      ))}
    </View>
  )
}

export default function Wardrobe() {
  const { data, error, isPending, isRefetching, refetch } = useQuery(getAllItemsQueryOptions)

  if (isPending) return <Skeletons />
  if (error && !data) return <ErrorState error={error} onRetry={() => void refetch()} />

  return (
    <FlatList
      className="flex-1 bg-white"
      contentContainerClassName="p-1.5"
      data={data.items}
      keyExtractor={(item) => item.id.toString()}
      numColumns={2}
      renderItem={({ item }) => <ItemCard item={item} />}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />}
      ListEmptyComponent={
        <View className="items-center gap-2 p-10">
          <Text className="text-lg font-semibold">Your wardrobe is empty</Text>
          <Text className="text-center text-neutral-500">Use the Add tab to photograph your first item.</Text>
        </View>
      }
    />
  )
}
```

Placeholders so the routes exist (Tasks 5 to 7 replace them). Write this to each of `(tabs)/add.tsx`, `(tabs)/profile.tsx` and `item/[id].tsx`, changing the function name and text (`Add`/`Profile`/`EditItem`):

```tsx
import { Text, View } from 'react-native'

export default function Add() {
  return (
    <View className="flex-1 items-center justify-center bg-white">
      <Text className="text-neutral-500">Add: coming in the next task</Text>
    </View>
  )
}
```

- [ ] **Step 9: Verify**

```bash
cd mobile && bunx tsc --noEmit && bun test src && bunx expo export --platform ios
bunx expo start --dev-client     # press i
```

In the simulator, signed in as Minh (screenshots with `xcrun simctl io booted screenshot <path>`):
- Grey skeleton tiles appear first, then a two-column photo grid with the same items as `https://stylify.space`.
- Pull down: the refresh spinner shows and the grid stays.
- Stop the API path to test "unreachable": relaunch with `EXPO_PUBLIC_API_URL=http://localhost:9 bunx expo start --dev-client --clear`. The Wardrobe tab shows "Can't reach the server…" with "Try again", and the app stays signed in. Relaunch without the variable afterwards.

- [ ] **Step 10: Commit**

```bash
git add mobile && git commit -m "feat(mobile): typed API client with 401/503 handling, and the wardrobe grid"
```

---

### Task 5: Add an item with a photo

**Files:**
- Create: `mobile/src/lib/upload.ts`, `mobile/src/lib/photo.ts`, `mobile/src/components/ItemForm.tsx`
- Modify: `mobile/src/app/(tabs)/add.tsx`

**Interfaces:**
- Consumes: `getSignedURL`, `createItem`, `getAllItemsQueryOptions`, `getTotalClothesQueryOptions` from `@/lib/api`; `errorMessage` from `@/components/ErrorState`.
- Produces: `toJpeg(uri: string, width: number): Promise<string>` and `uploadImage(jpegUri: string): Promise<string>` (returns the public S3 URL) from `@/lib/upload`; `pickPhoto(source: 'camera' | 'library'): Promise<string | null>` and `type PhotoSource` from `@/lib/photo`; `ItemForm` and `type ItemFields = { name: string; type: string; size: string; color: string }` from `@/components/ItemForm`. `ItemForm` props: `initial?: ItemFields`, `currentImageUrl?: string`, `submitLabel: string`, `onSubmit: (fields: ItemFields, newPhotoUri: string | null) => Promise<void>`. If `onSubmit` rejects, the form shows the message and stays filled in.

- [ ] **Step 1: Read the SDK pages for the three native modules**

`https://docs.expo.dev/versions/v57.0.0/sdk/imagepicker/`, `.../sdk/imagemanipulator/`, `.../sdk/filesystem/`. The snippets below were typechecked against 57.0.20, 57.0.21 and 57.0.7; confirm nothing they use is marked deprecated.

- [ ] **Step 2: Upload helpers**

`mobile/src/lib/upload.ts`:

```ts
import { File } from 'expo-file-system'
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'

import { getSignedURL } from './api'

const MAX_WIDTH = 1600

// iPhone photos are often HEIC and several megabytes; the server names every
// object .jpg, so always re-encode. Resizing only ever shrinks.
export async function toJpeg(uri: string, width: number): Promise<string> {
  const context = ImageManipulator.manipulate(uri)
  if (width > MAX_WIDTH) context.resize({ width: MAX_WIDTH })
  const image = await context.renderAsync()
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 })
  return saved.uri
}

// Uploads a local JPEG straight to S3 and returns its public URL.
export async function uploadImage(jpegUri: string): Promise<string> {
  const data = await getSignedURL()
  if (!data.success) throw new Error('Could not start the upload')
  const result = await new File(jpegUri).upload(data.signedURL, {
    httpMethod: 'PUT',
    headers: { 'Content-Type': 'image/jpeg' },
  })
  if (result.status < 200 || result.status >= 300) {
    throw new Error('Could not upload the photo')
  }
  return data.signedURL.split('?')[0]
}
```

The presigned URL is for a `PutObject` with no content type bound, so any `Content-Type` header is accepted; the web app sends the file's own type.

- [ ] **Step 3: Photo picker**

`mobile/src/lib/photo.ts`:

```ts
import * as ImagePicker from 'expo-image-picker'
import { Alert, Linking } from 'react-native'

import { toJpeg } from './upload'

export type PhotoSource = 'camera' | 'library'

function explainDenied(source: PhotoSource) {
  const what = source === 'camera' ? 'the camera' : 'your photos'
  Alert.alert(
    'Permission needed',
    `Stylify needs access to ${what} to add a picture. You can allow it in Settings.`,
    [
      { text: 'Not now', style: 'cancel' },
      { text: 'Open Settings', onPress: () => void Linking.openSettings() },
    ],
  )
}

// Returns the URI of a local JPEG, or null if the user cancelled or refused.
export async function pickPhoto(source: PhotoSource): Promise<string | null> {
  const permission =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync()
  if (!permission.granted) {
    explainDenied(source)
    return null
  }

  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1 }
  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options)
  if (result.canceled) return null

  const asset = result.assets[0]
  return toJpeg(asset.uri, asset.width)
}
```

The camera and photo-library usage strings were set in `app.json` in Task 2 (`expo-image-picker` plugin).

- [ ] **Step 4: The shared form**

`mobile/src/components/ItemForm.tsx`:

```tsx
import { createItemSchema } from '@stylify/shared'
import { useForm } from '@tanstack/react-form'
import { zodValidator } from '@tanstack/zod-form-adapter'
import { Image } from 'expo-image'
import { useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native'

import { errorMessage } from '@/components/ErrorState'
import { pickPhoto, type PhotoSource } from '@/lib/photo'

export type ItemFields = { name: string; type: string; size: string; color: string }

type Props = {
  initial?: ItemFields
  // The saved image when editing; undefined when adding.
  currentImageUrl?: string
  submitLabel: string
  // newPhotoUri is a local JPEG the user just chose, or null to keep currentImageUrl.
  onSubmit: (fields: ItemFields, newPhotoUri: string | null) => Promise<void>
}

const EMPTY: ItemFields = { name: '', type: '', size: '', color: '' }
const FIELDS = [
  { name: 'name', label: 'Name' },
  { name: 'type', label: 'Type' },
  { name: 'size', label: 'Size' },
  { name: 'color', label: 'Colour' },
] as const

export function ItemForm({ initial, currentImageUrl, submitLabel, onSubmit }: Props) {
  const [photoUri, setPhotoUri] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const shownImage = photoUri ?? currentImageUrl

  const form = useForm({
    validatorAdapter: zodValidator(),
    defaultValues: initial ?? EMPTY,
    onSubmit: async ({ value }) => {
      if (!shownImage) {
        setError('Add a photo first')
        return
      }
      setError(null)
      try {
        await onSubmit(value, photoUri)
      } catch (e) {
        // The form stays filled in, so pressing the button again is the retry.
        setError(errorMessage(e))
      }
    },
  })

  async function choose(source: PhotoSource) {
    try {
      const uri = await pickPhoto(source)
      if (uri) {
        setPhotoUri(uri)
        setError(null)
      }
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  return (
    <ScrollView className="flex-1 bg-white" contentContainerClassName="gap-4 p-4" keyboardShouldPersistTaps="handled">
      {shownImage ? (
        <Image source={{ uri: shownImage }} style={{ width: '100%', aspectRatio: 1, borderRadius: 12 }} contentFit="cover" />
      ) : (
        <View className="aspect-square w-full items-center justify-center rounded-xl bg-neutral-100">
          <Text className="text-neutral-500">No photo yet</Text>
        </View>
      )}

      <View className="flex-row gap-3">
        <Pressable className="flex-1 items-center rounded-lg bg-neutral-200 py-3" onPress={() => choose('camera')}>
          <Text className="font-semibold">Take photo</Text>
        </Pressable>
        <Pressable className="flex-1 items-center rounded-lg bg-neutral-200 py-3" onPress={() => choose('library')}>
          <Text className="font-semibold">Choose photo</Text>
        </Pressable>
      </View>

      {FIELDS.map(({ name, label }) => (
        <form.Field key={name} name={name} validators={{ onChange: createItemSchema.shape[name] }}>
          {(field) => (
            <View className="gap-1">
              <Text className="text-sm font-medium text-neutral-700">{label}</Text>
              <TextInput
                className="rounded-lg border border-neutral-300 px-3 py-3 text-base"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChangeText={field.handleChange}
                accessibilityLabel={label}
              />
              {field.state.meta.isTouched && field.state.meta.errors.length ? (
                <Text className="text-sm text-red-600">{field.state.meta.errors.join(', ')}</Text>
              ) : null}
            </View>
          )}
        </form.Field>
      ))}

      {error ? <Text className="text-red-600">{error}</Text> : null}

      <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting] as const}>
        {([canSubmit, isSubmitting]) => (
          <Pressable
            className={`items-center rounded-lg py-4 ${canSubmit && !isSubmitting ? 'bg-neutral-900' : 'bg-neutral-400'}`}
            disabled={!canSubmit || isSubmitting}
            onPress={() => void form.handleSubmit()}>
            {isSubmitting ? <ActivityIndicator color="white" /> : <Text className="font-semibold text-white">{submitLabel}</Text>}
          </Pressable>
        )}
      </form.Subscribe>
    </ScrollView>
  )
}
```

- [ ] **Step 5: The Add screen**

`mobile/src/app/(tabs)/add.tsx`:

```tsx
import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { useState } from 'react'

import { ItemForm, type ItemFields } from '@/components/ItemForm'
import { createItem, getAllItemsQueryOptions, getTotalClothesQueryOptions } from '@/lib/api'
import { uploadImage } from '@/lib/upload'

export default function Add() {
  const queryClient = useQueryClient()
  const router = useRouter()
  // Changing the key remounts the form, which empties it after a save.
  const [formKey, setFormKey] = useState(0)
  // A photo that reached S3 but whose item was not saved; reused on retry.
  const [uploaded, setUploaded] = useState<{ uri: string; url: string } | null>(null)

  async function save(fields: ItemFields, photoUri: string | null) {
    if (!photoUri) throw new Error('Add a photo first')
    let imageUrl: string
    if (uploaded?.uri === photoUri) {
      imageUrl = uploaded.url
    } else {
      imageUrl = await uploadImage(photoUri)
      setUploaded({ uri: photoUri, url: imageUrl })
    }

    const newItem = await createItem({ value: { ...fields, imageUrl } })

    queryClient.setQueryData(getAllItemsQueryOptions.queryKey, (old) =>
      old ? { ...old, items: [newItem, ...old.items] } : old,
    )
    queryClient.setQueryData(getTotalClothesQueryOptions.queryKey, (old) =>
      old ? { ...old, total: old.total + 1 } : old,
    )
    setUploaded(null)
    setFormKey((key) => key + 1)
    router.navigate('/')
  }

  return <ItemForm key={formKey} submitLabel="Add item" onSubmit={save} />
}
```

- [ ] **Step 6: Verify**

```bash
cd mobile && bunx tsc --noEmit && bun test src && bunx expo export --platform ios
bunx expo run:ios     # app.json already has the picker plugin; rebuild if the last native build predates Task 2 Step 4
```

In the simulator (it has no camera; "Take photo" is checked on the iPhone in Task 8):
- "Choose photo" → allow access → pick one of the simulator's sample photos → the preview shows it.
- Press "Add item" with empty fields after touching them: each shows its validation message and nothing is sent.
- Fill the four fields with `TEST mobile` / `shirt` / `M` / `blue` → "Add item" → the app returns to Wardrobe and the new item is first in the grid, with its photo.
- Open `https://stylify.space` (Minh, logged in): the item is there with the photo. Its image URL ends in `.jpg`.
- Leave the test item; Task 6 edits and deletes it.

- [ ] **Step 7: Commit**

```bash
git add mobile && git commit -m "feat(mobile): add an item with a photo from the camera or library"
```

---

### Task 6: Edit and delete

**Files:**
- Modify: `mobile/src/app/item/[id].tsx`

**Interfaces:**
- Consumes: `ItemForm`, `ItemFields`; `uploadImage`; `ErrorState`, `errorMessage`; `getItemQueryOptions`, `editItem`, `deleteItem`, `getAllItemsQueryOptions`, `getTotalClothesQueryOptions`.

- [ ] **Step 1: The Edit screen**

`mobile/src/app/item/[id].tsx`:

```tsx
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native'

import { ErrorState, errorMessage } from '@/components/ErrorState'
import { ItemForm, type ItemFields } from '@/components/ItemForm'
import {
  deleteItem,
  editItem,
  getAllItemsQueryOptions,
  getItemQueryOptions,
  getTotalClothesQueryOptions,
} from '@/lib/api'
import { uploadImage } from '@/lib/upload'

export default function EditItem() {
  const params = useLocalSearchParams<{ id: string }>()
  const id = Number(params.id)
  const queryClient = useQueryClient()
  const router = useRouter()
  const [deleting, setDeleting] = useState(false)
  const { data, error, isPending, refetch } = useQuery({ ...getItemQueryOptions(id), enabled: Number.isInteger(id) })

  if (!Number.isInteger(id)) return <ErrorState error={new Error('This item does not exist')} onRetry={() => router.back()} />
  if (isPending) return <ActivityIndicator className="flex-1" />
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />

  const item = data.item

  async function save(fields: ItemFields, photoUri: string | null) {
    const imageUrl = photoUri ? await uploadImage(photoUri) : item.imageUrl
    const updated = await editItem({ id, value: { ...fields, imageUrl } })
    queryClient.setQueryData(getItemQueryOptions(id).queryKey, { item: updated })
    queryClient.setQueryData(getAllItemsQueryOptions.queryKey, (old) =>
      old ? { ...old, items: old.items.map((existing) => (existing.id === id ? updated : existing)) } : old,
    )
    router.back()
  }

  async function remove() {
    setDeleting(true)
    try {
      await deleteItem({ id })
      queryClient.setQueryData(getAllItemsQueryOptions.queryKey, (old) =>
        old ? { ...old, items: old.items.filter((existing) => existing.id !== id) } : old,
      )
      queryClient.setQueryData(getTotalClothesQueryOptions.queryKey, (old) =>
        old ? { ...old, total: Math.max(0, old.total - 1) } : old,
      )
      queryClient.removeQueries({ queryKey: getItemQueryOptions(id).queryKey })
      router.back()
    } catch (e) {
      setDeleting(false)
      Alert.alert('Could not delete', errorMessage(e))
    }
  }

  function confirmDelete() {
    Alert.alert('Delete this item?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void remove() },
    ])
  }

  return (
    <View className="flex-1 bg-white">
      <ItemForm
        initial={{ name: item.name ?? '', type: item.type ?? '', size: item.size ?? '', color: item.color ?? '' }}
        currentImageUrl={item.imageUrl}
        submitLabel="Save changes"
        onSubmit={save}
      />
      <Pressable className="m-4 items-center rounded-lg border border-red-600 py-4" disabled={deleting} onPress={confirmDelete}>
        {deleting ? <ActivityIndicator /> : <Text className="font-semibold text-red-600">Delete item</Text>}
      </Pressable>
    </View>
  )
}
```

Deleting on the server also removes the image from S3; an item whose photo was replaced keeps its old image in the bucket, as on the web.

- [ ] **Step 2: Verify**

```bash
cd mobile && bunx tsc --noEmit && bun test src && bunx expo export --platform ios
```

In the simulator:
- Tap the `TEST mobile` item: the form opens pre-filled with its photo.
- Change the name to `TEST mobile edited` → "Save changes" → back on the grid the name is updated without a reload.
- Open it again → "Choose photo" → pick a different photo → "Save changes" → the grid shows the new photo.
- Review Focus 5: Minh deletes any other test item on the web while the phone grid still shows it; tapping it on the phone shows "Could not load this item" with "Try again", and the back button works.
- Open `TEST mobile edited` → "Delete item" → "Cancel": nothing happens. Again → "Delete": back on the grid, the item is gone. Confirm on the web that it is gone.

- [ ] **Step 3: Commit**

```bash
git add mobile && git commit -m "feat(mobile): edit and delete an item"
```

---

### Task 7: Profile

**Files:**
- Modify: `mobile/src/app/(tabs)/profile.tsx`

**Interfaces:**
- Consumes: `getTotalClothesQueryOptions`; `useKindeAuth().getUserProfile()` (returns `{ id, givenName?, familyName?, email?, picture? } | null`) and `logout`.

- [ ] **Step 1: The Profile screen**

`mobile/src/app/(tabs)/profile.tsx`:

```tsx
import { useKindeAuth } from '@kinde/expo'
import { useQuery } from '@tanstack/react-query'
import { Image } from 'expo-image'
import { Pressable, Text, View } from 'react-native'

import { getTotalClothesQueryOptions } from '@/lib/api'

export default function Profile() {
  const kinde = useKindeAuth()
  // The bearer token carries only the user ID, so the profile comes from the SDK.
  const profile = useQuery({ queryKey: ['kinde-profile'], queryFn: () => kinde.getUserProfile(), staleTime: Infinity })
  const total = useQuery(getTotalClothesQueryOptions)

  const user = profile.data
  const name = [user?.givenName, user?.familyName].filter(Boolean).join(' ')

  return (
    <View className="flex-1 items-center gap-3 bg-white p-6">
      {user?.picture ? (
        <Image source={{ uri: user.picture }} style={{ width: 96, height: 96, borderRadius: 48 }} />
      ) : (
        <View className="h-24 w-24 rounded-full bg-neutral-200" />
      )}
      <Text className="text-2xl font-bold">{name || 'Your profile'}</Text>
      {user?.email ? <Text className="text-neutral-600">{user.email}</Text> : null}
      <Text className="text-neutral-600">
        {total.data ? `${total.data.total} ${total.data.total === 1 ? 'item' : 'items'}` : total.isError ? 'Item count unavailable' : ' '}
      </Text>
      <Pressable className="mt-6 w-full items-center rounded-lg bg-neutral-900 py-4" onPress={() => void kinde.logout({ revokeToken: true })}>
        <Text className="font-semibold text-white">Sign out</Text>
      </Pressable>
    </View>
  )
}
```

- [ ] **Step 2: Verify**

```bash
cd mobile && bunx tsc --noEmit && bun test src && bunx expo export --platform ios
```

In the simulator: the Profile tab shows Minh's name, email, picture and an item count equal to the number of tiles in the grid. "Sign out" returns to the sign-in screen; signing in again shows the wardrobe.

- [ ] **Step 3: Commit**

```bash
git add mobile && git commit -m "feat(mobile): profile screen with sign out"
```

---

### Task 8: The device checklist on Minh's iPhone

**Files:** none planned; fixes for anything the checklist finds.

- [ ] **Step 1: Install on the iPhone with free provisioning**

Minh connects the iPhone by cable, unlocks it, and trusts the Mac. Then:

```bash
cd mobile && bunx expo run:ios --device
```

If signing fails: Minh opens `mobile/ios/Stylify.xcworkspace` in Xcode → target "Stylify" → Signing & Capabilities → tick "Automatically manage signing" → Team: their personal team (add the Apple ID under Xcode → Settings → Accounts if it is missing) → run the command again. On the phone: Settings → General → VPN & Device Management → trust the developer. The build expires after 7 days; rerun the command to renew it.

The phone must reach the Mac's dev server: both on the same Wi-Fi.

- [ ] **Step 2: Minh runs the checklist**

Give Minh this list and record each result.

1. Sign in with the usual account. The wardrobe matches the web.
2. Add → "Take photo" → allow the camera → photograph something → fill the fields (name starting `TEST`) → "Add item". It appears first in the grid, and on the web.
3. Add → "Choose photo" → allow photos → pick a photo → save. Same result.
4. Refuse a permission: delete the app's camera permission (Settings → Stylify → Camera off), tap "Take photo". An alert explains and "Open Settings" opens the app's settings.
5. Edit a `TEST` item's name and photo. Both update in the grid.
6. Review Focus 4: start adding an item, choose a photo, fill the fields, turn on Airplane Mode, press "Add item". An error appears and the form is still filled in. Turn Airplane Mode off, press "Add item" again. The item is saved once (one new tile, not two).
7. Delete every `TEST` item. They disappear from the grid and from the web.
8. Review Focus 5 was checked in Task 6; repeat on the phone if any fix touched the edit screen.
9. Review Focus 1: Sign out. Sign in with a second account (Minh creates one with another email). The wardrobe is empty, not Minh's. Sign out, sign back in as Minh: the wardrobe is back.
10. Review Focus 3, observation only: with the app open on the Wardrobe tab, turn on Airplane Mode and pull to refresh. Expected: "Can't reach the server" or the grid stays, and the app stays signed in. Record what happens.
11. Force-quit the app and reopen it: still signed in.

- [ ] **Step 3: Fix what failed**

For each failure: reproduce it, write the smallest fix, rerun the three static checks, and have Minh repeat that checklist line. If step 10 signs the user out, record it in `docs/mobile.md` (Task 10) as a known limit; do not redesign the refresh path in this plan.

- [ ] **Step 4: Commit**

```bash
git add mobile && git commit -m "fix(mobile): findings from the device checklist"    # skip if nothing changed
```

---

### Task 9: TestFlight

Minh starts the Apple Developer Program enrolment when Task 6 is done (it can take a day or two). This task waits until it is active.

**Files:**
- Create: `mobile/eas.json`
- Modify: `mobile/app.json` (EAS adds `extra.eas.projectId` and `owner`)

- [ ] **Step 1: Read the current EAS pages**

`https://docs.expo.dev/build/setup/`, `https://docs.expo.dev/submit/ios/`, `https://docs.expo.dev/eas/environment-variables/`, and `https://docs.expo.dev/build-reference/build-with-monorepos/`. EAS commands change; where a command below differs from the page, use the page.

- [ ] **Step 2: Sign in and link the project (Minh types the credentials)**

```bash
cd mobile
bunx eas-cli login
bunx eas-cli init
```

- [ ] **Step 3: Build profile**

`mobile/eas.json`:

```json
{
  "cli": { "appVersionSource": "remote" },
  "build": {
    "production": {
      "bun": "1.3.13",
      "autoIncrement": true,
      "ios": { "resourceClass": "m-medium" }
    }
  },
  "submit": {
    "production": {}
  }
}
```

- [ ] **Step 4: Give the build its two settings**

`mobile/.env.local` is not uploaded. Create the two variables in EAS for the production environment, as plain text (they ship in the app). Minh runs these and types the values:

```bash
bunx eas-cli env:create --environment production --name EXPO_PUBLIC_KINDE_DOMAIN --visibility plaintext
bunx eas-cli env:create --environment production --name EXPO_PUBLIC_KINDE_CLIENT_ID --visibility plaintext
```

- [ ] **Step 5: Build and submit (Minh answers the Apple prompts)**

```bash
bunx eas-cli build --platform ios --profile production
bunx eas-cli submit --platform ios --latest
```

On the first build EAS asks to sign in to the Apple account and offers to create the distribution certificate, provisioning profile and App Store Connect app for `space.stylify.app`: accept each.

- [ ] **Step 6: Verify the TestFlight build**

When App Store Connect finishes processing, Minh installs the build from the TestFlight app and repeats checklist lines 1, 2, 5, 7 and 11 from Task 8. The production build has no dev server: if sign-in fails here but worked in development, the two EAS variables are missing or wrong.

- [ ] **Step 7: Commit**

```bash
git add mobile/eas.json mobile/app.json && git commit -m "build(mobile): EAS profile for TestFlight"
```

---

### Task 10: Documentation and merge

**Files:**
- Create: `docs/mobile.md`
- Modify: `AGENTS.md`, `docs/superpowers/specs/2026-10-05-mobile-foundation-design.md`

- [ ] **Step 1: Write `docs/mobile.md`**

Write it from what was actually built, with these sections and facts. Where Tasks 2, 8 or 9 deviated from this plan (the NativeWind fallback, a different redirect URI, a checklist limit, a changed EAS command), document what is real.

```markdown
# Mobile app

The iPhone app in `mobile/`: Expo SDK 57, Expo Router, the same Hono API as the web app.

## Run it

- Needs Xcode. From `mobile/`: `bunx expo run:ios` builds and opens the simulator; later, `bunx expo start --dev-client` is enough unless native dependencies changed.
- On a phone: `bunx expo run:ios --device` (free provisioning; expires after 7 days).
- `mobile/.env.local` (not in git) holds `EXPO_PUBLIC_KINDE_DOMAIN` and `EXPO_PUBLIC_KINDE_CLIENT_ID`. `EXPO_PUBLIC_API_URL` points the app at a local API; the default is `https://stylify.space`. Restart with `--clear` after changing any of them.
- Checks: `bunx tsc --noEmit`, `bun test src`, `bunx expo export --platform ios`.
- The app talks to the production database and bucket. Delete test items.

## Auth

- Kinde application "Stylify iOS" (type "Front-end and mobile"), authorised for the `Stylify API`. Callback and logout redirect: the URI the sign-in screen printed in Task 3.
- `login({ audience: 'https://stylify.space/api' })`. The access token goes out as `Authorization: Bearer`; the server reads only its `sub`.
- `src/lib/authFetch.ts` holds the rules: 401 → one shared refresh → one retry → sign out. 502/503/504 or no network → `ServerUnreachableError`, still signed in.
- `src/components/AuthBridge.tsx` gives the API client the Kinde functions and clears the query cache when the session ends.
- The profile screen reads name, email and picture from the SDK, not from `/api/me`.

## Screens and data

- Routes in `src/app/`: `sign-in`, `(tabs)/index` (wardrobe), `(tabs)/add`, `(tabs)/profile`, `item/[id]`.
- `src/lib/api.ts` mirrors `frontend/src/lib/api.ts`: same query keys, and mutations write the server's response into the cache with `setQueryData`.
- Photos: picked with `expo-image-picker`, re-encoded to JPEG (max width 1600) with `expo-image-manipulator`, uploaded straight to S3 with `File.upload` and the presigned URL from `GET /api/signed-url`.

## Release

- `eas.json` has one profile, `production`. From `mobile/`: `bunx eas-cli build --platform ios --profile production`, then `bunx eas-cli submit --platform ios --latest`.
- The two `EXPO_PUBLIC_KINDE_*` values live in EAS environment variables (production).
- There is no CI for mobile; nothing under `mobile/` triggers a deploy.

## Known limits

(List what Task 8 found, including the result of checklist line 10.)
```

- [ ] **Step 2: Update `AGENTS.md`**

- Intro: replace "is being built; see `docs/superpowers/specs/` for the current design and roadmap" with "ships through TestFlight; see `docs/mobile.md`".
- Path table: add rows for `mobile/src/lib/api.ts` ("Typed Hono client and `queryOptions` for the app"), `mobile/src/lib/authFetch.ts` ("401/503 rules, with tests") and `mobile/src/app/` ("Expo Router routes; `_layout.tsx` is the auth guard").
- Commands: add `(cd mobile && bunx tsc --noEmit && bun test src)  # mobile typecheck and tests` and `(cd mobile && bunx expo run:ios)  # build and open the simulator (needs Xcode)`.
- Patterns, "Auth has two paths": append "A bearer token that could not be checked (Kinde unreachable, or `KINDE_AUDIENCE` unset) is a 503, which the mobile app treats as 'server unreachable' and not as signed out."
- Docs table: add `docs/mobile.md` | "The Expo app: running, auth, release".

- [ ] **Step 3: Update the spec's status**

In `docs/superpowers/specs/2026-10-05-mobile-foundation-design.md` set the status line to `Status: implemented` and, under "Still open, checked during plan 2 with a real token", replace the three bullets with their results.

- [ ] **Step 4: Final checks and commit**

```bash
(cd mobile && bunx tsc --noEmit && bun test src && bunx expo export --platform ios)
bun test ./server && (cd frontend && bun run typecheck)
git add docs AGENTS.md && git commit -m "docs: mobile app guide; update AGENTS.md and the spec status"
```

- [ ] **Step 5: Merge (needs Minh's OK)**

`feat/mobile-app` changes only `mobile/`, `docs/`, `AGENTS.md` and `bun.lockb`, none of which is a deploy trigger. Confirm that, then ask Minh before pushing:

```bash
git diff --stat main...feat/mobile-app -- server shared frontend package.json .github   # must print nothing
git checkout main && git merge --ff-only feat/mobile-app && git push origin main
gh run list --limit 3     # no new deploy runs should start
```

If the diff prints anything, tell Minh the push will deploy and run the smoke test from `AGENTS.md` afterwards.
