# Deployable Workspaces and Bearer Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the staged `shared/` workspace refactor without breaking stylify.space, then let the API accept a Kinde access token as a bearer token alongside today's cookie auth, and bring the agent docs up to date.

**Architecture:** The backend image installs only the server's dependencies from the root lockfile with `--filter server`. Auth splits into two small files: a pure token verifier (`server/auth/bearer.ts`, built on `jose`) and a middleware factory (`server/auth/getUser.ts`) that takes the verifier and the cookie check as injected functions, so both are unit-testable without Kinde. `server/kinde.ts` wires the real ones together and keeps exporting `getUser`.

**Tech Stack:** Bun 1.3.13, Hono 4, `jose`, `bun test`, Docker, GitHub Actions, AWS Lambda.

**Spec:** `docs/superpowers/specs/2026-10-05-mobile-foundation-design.md` (Parts 1, 2 and the non-mobile docs in Part 4). The Expo app is a separate, later plan.

## Global Constraints

- Every push to `main` that touches `server/`, `shared/`, `frontend/` or the root `package.json` deploys to the live site. `bun.lockb` alone is deliberately not a trigger: once `mobile/` joins the workspace, mobile dependency changes rewrite the lockfile and must not redeploy the web app. Any real web or server dependency change also edits that workspace's `package.json`, which does trigger. **Ask Minh before every push to `main`.** Never force-push `main`.
- Work on a branch; reach `main` only by `git merge --ff-only`.
- Bun is pinned to `1.3.13` everywhere (local, CI, Docker). Check with `bun --version` before starting; stop if it differs.
- React is pinned to exactly `19.2.3` (`react` and `react-dom`) in `frontend/package.json` and in root `overrides`. This is the version the Expo SDK 57 template uses; web and mobile must share one copy once `mobile/` is a workspace member.
- The cookie auth path must behave exactly as it does today.
- A request with a bearer header that fails verification gets 401 and never falls back to cookies.
- Bearer verification checks signature (Kinde JWKS), issuer (`KINDE_DOMAIN`), audience (`KINDE_AUDIENCE`) and expiry.
- The server must boot and serve cookie-authenticated requests even when `KINDE_AUDIENCE` is not set.
- Do not print or commit values from `.env`.
- Known baseline: `cd frontend && bunx tsc -p tsconfig.app.json --noEmit` reports one syntax error (`src/lib/api.ts(132,97): error TS1005`). **Correction, found during Task 4 review:** that syntax error makes `tsc` skip all type checking, so this check proves nothing about types. With the syntax patched temporarily, the frontend has 15 real type errors, all in code this plan does not change in substance (TanStack Form validator types in `create-item.tsx` and `edit-item.$id.tsx`, untyped values in `edit-item.$id.tsx`, a nullable `alt` in `index.tsx`, three unused declarations). None come from the optional `/api/me` fields. Fixing them is out of scope here. `cd server && bunx tsc --noEmit` is clean and is a real check. The frontend build (`vite build`) does not typecheck.
- Rollback for any bad deploy: `git revert --no-edit <bad commits>` on `main`, then push (after telling Minh). The workflows redeploy the previous code.

## Review Focus

Conditions the spec implies that are most likely to hurt a real user. Each has a test in the task named.

1. Lambda is deployed before `KINDE_AUDIENCE` is set: bearer requests get 401, the server still boots, the web app keeps working. (Task 3, "rejects when audience is not configured"; Task 4 wiring is lazy.)
2. Kinde's JWKS endpoint is unreachable: the request gets 401, not a 500 or a crash. (Task 3, "rejects when the key set cannot be loaded".)
3. A token signed with a different algorithm (HS256 with a guessed secret): rejected. (Task 3, "rejects a token signed with HS256".)
4. `Authorization` header variants: lowercase `bearer`, `Bearer` with no token, a non-bearer scheme such as `Basic`. Lowercase is treated as bearer; empty is 401; `Basic` goes to the cookie path. (Task 4.)
5. A correctly signed token with no `exp` or no `sub`: rejected. (Task 3.)

---

## File Structure

| File | Responsibility |
|---|---|
| `server/Dockerfile` (modify) | Build the Lambda image from the root lockfile, server deps only |
| `.dockerignore` (modify) | Keep nested `node_modules` out of the build context |
| `package.json`, `frontend/package.json` (modify) | React 19.2.3, forced to a single copy with `overrides` |
| `.github/workflows/deploy-backend.yml` (modify) | Pin Bun, run tests, trigger on lockfile changes |
| `.github/workflows/deploy-frontend.yml` (modify) | Pin Bun, frozen install, trigger on lockfile changes |
| `server/auth/bearer.ts` (create) | `createBearerVerifier`: token string in, `{ id }` out, or throws `BearerAuthError` |
| `server/auth/bearer.test.ts` (create) | Verifier tests with a local key pair |
| `server/auth/getUser.ts` (create) | `createGetUser`: Hono middleware choosing bearer or cookie; `AuthUser` type |
| `server/auth/getUser.test.ts` (create) | Middleware tests with fake verifier and fake cookie check |
| `server/kinde.ts` (modify) | Wire real verifier and cookie check; export `getUser` |
| `frontend/src/routes/_authenticated/profile.tsx` (modify) | Tolerate optional name fields |
| `AGENTS.md` (create), `CLAUDE.md` (replace) | Agent instructions; `CLAUDE.md` imports `AGENTS.md` |
| `docs/*.md`, `README.md` (modify) | Fix stale references |

---

### Task 1: Make the workspace refactor deployable and ship it

The staged refactor moves the shared Zod schema to `shared/`. Two things stop it deploying (both reproduced on 2026-10-05): the staged `bun.lockb` fails a frozen install, and the Dockerfile does not copy `frontend/package.json`, so Bun stops with `Workspace not found "frontend"`.

**Files:**
- Modify: `bun.lockb` (regenerated), `server/Dockerfile`, `.dockerignore`, `.github/workflows/deploy-backend.yml`, `.github/workflows/deploy-frontend.yml`
- Already staged, committed here unchanged: everything in `git diff --cached --stat`

**Interfaces:**
- Consumes: nothing.
- Produces: a green pipeline on `main`; `@stylify/shared` importable from `server/` and `frontend/`.

- [ ] **Step 1: Branch, carrying the staged changes**

```bash
cd /Users/ml3787/Stylify
bun --version          # must print 1.3.13
git checkout -b chore/deployable-workspaces
git status --short     # the staged refactor files are still staged
```

- [ ] **Step 2: Reproduce the lockfile failure**

Run: `bun install --frozen-lockfile`
Expected: FAIL with `error: lockfile had changes, but lockfile is frozen`

- [ ] **Step 3: Regenerate the lockfile**

```bash
bun install
bun install --frozen-lockfile
```

Expected: the second command succeeds with no lockfile error. `git status --short bun.lockb` shows it modified. No `bun.lock` text file appears at the root; if one does, stop and tell Minh, because the Dockerfile and CI triggers name `bun.lockb`.

- [ ] **Step 4: Replace `server/Dockerfile`**

```dockerfile
FROM public.ecr.aws/awsguru/aws-lambda-adapter:0.9.0 AS aws-lambda-adapter
FROM oven/bun:1.3.13-debian

COPY --from=aws-lambda-adapter /lambda-adapter /opt/extensions/lambda-adapter

ENV PORT=8080
WORKDIR /var/task

# Bun needs the manifest of every workspace listed in the root package.json,
# or it fails with "Workspace not found". --filter installs only server's deps.
COPY package.json bun.lockb ./
COPY server/package.json ./server/
COPY shared/package.json ./shared/
COPY frontend/package.json ./frontend/
RUN bun install --production --frozen-lockfile --filter server

COPY server/ ./server/
COPY shared/ ./shared/

CMD ["bun", "server/index.ts"]
```

- [ ] **Step 5: Replace `.dockerignore`**

```
**/node_modules
frontend/dist
.env
.git
.gitignore
drizzle
README.md
docs/
models/
```

- [ ] **Step 6: Build the image natively and check it answers**

```bash
docker build -t stylify-server:local -f server/Dockerfile .
docker run --rm -d --name stylify-local -p 8081:8080 --env-file .env stylify-server:local
curl -s -o /dev/null -w '%{http_code}\n' --retry 10 --retry-connrefused --retry-delay 1 http://localhost:8081/api/me
docker logs stylify-local 2>&1 | tail -5
docker stop stylify-local
```

Expected: the build succeeds and `curl` prints `401`. The log shows a `GET /api/me 401` line and no module-resolution error. A `Cannot find module '@stylify/shared'` or `'zod'` error means the install step is wrong; fix before continuing.

- [ ] **Step 7: Build the image the way CI does**

Run: `docker build --platform linux/amd64 --provenance=false -t stylify-server:amd64 -f server/Dockerfile .`
Expected: build succeeds.

- [ ] **Step 8: Replace `.github/workflows/deploy-backend.yml`**

```yaml
name: Deploy Backend

on:
  workflow_dispatch:
  push:
    branches: [main]
    paths:
      - 'server/**'
      - 'shared/**'
      - 'package.json'
      - '.github/workflows/deploy-backend.yml'

jobs:
  deploy:
    name: Build & Deploy
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1

      - name: Login to ECR
        uses: aws-actions/amazon-ecr-login@v2

      - name: Build and push image
        run: |
          docker build --platform linux/amd64 --provenance=false \
            -t 779846779460.dkr.ecr.us-east-1.amazonaws.com/wardrobe-app:latest \
            -f server/Dockerfile .
          docker push 779846779460.dkr.ecr.us-east-1.amazonaws.com/wardrobe-app:latest

      - name: Update Lambda
        run: |
          aws lambda update-function-code \
            --function-name stylifyServer \
            --image-uri 779846779460.dkr.ecr.us-east-1.amazonaws.com/wardrobe-app:latest \
            --region us-east-1
```

- [ ] **Step 9: Replace `.github/workflows/deploy-frontend.yml`**

```yaml
name: Deploy Frontend

on:
  workflow_dispatch:
  push:
    branches: [main]
    paths:
      - 'frontend/**'
      - 'shared/**'
      - 'package.json'
      - '.github/workflows/deploy-frontend.yml'

jobs:
  deploy:
    name: Build & Deploy
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.3.13

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Build
        working-directory: frontend
        run: bun run build

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1

      - name: Sync to S3
        run: aws s3 sync frontend/dist/ s3://stylify-frontend/ --delete --region us-east-1

      - name: Invalidate CloudFront cache
        run: |
          aws cloudfront create-invalidation \
            --distribution-id EIH8J5L7N96GZ \
            --paths "/*" \
            --region us-east-1
```

- [ ] **Step 10: Verify the frontend build and both typechecks**

```bash
(cd frontend && bun run build)
(cd server && bunx tsc --noEmit)
(cd frontend && bunx tsc -p tsconfig.app.json --noEmit)
```

Expected: the build writes `frontend/dist/`; the server typecheck prints nothing; the frontend typecheck prints only the one baseline error named in Global Constraints.

- [ ] **Step 11: Commit**

```bash
git add bun.lockb server/Dockerfile .dockerignore .github/workflows/deploy-backend.yml .github/workflows/deploy-frontend.yml docs/superpowers
git status --short     # nothing unstaged, no untracked files except ignored ones
git commit -m "chore: move shared schema to a workspace and make the build deployable"
```

- [ ] **Step 12: Ask Minh, then ship**

Tell Minh: this push deploys both the backend and the frontend. After a yes:

```bash
git checkout main
git merge --ff-only chore/deployable-workspaces
git push origin main
gh run list --limit 4
```

Watch each new run: `gh run watch <run-id> --exit-status`
Expected: `Deploy Backend` and `Deploy Frontend` both finish with success. On failure, read `gh run view <run-id> --log-failed`, and revert per Global Constraints if the live site is affected.

- [ ] **Step 13: Smoke-test the live site**

```bash
curl -s -o /dev/null -w 'site %{http_code}\n' https://stylify.space
curl -s -o /dev/null -w 'me %{http_code}\n' https://stylify.space/api/me
curl -s -o /dev/null -w 'recs %{http_code}\n' 'https://stylify.space/api/recommendations?lat=1&lon=1'
```

Expected: `site 200`, `me 401`, `recs 401`. Then ask Minh to do the manual check in a browser: log in, create an item with a photo, edit it, delete it, log out. Task 1 is done when Minh confirms.

---

### Task 2: Move the web app to React 19

The mobile app will be a member of this Bun workspace, and Expo SDK 57 requires React 19.2.3. Two React versions in one workspace end up as two copies inside one app, which breaks hooks at runtime, so the web app moves to the same exact version first, as its own deploy.

Tested in a throwaway copy on 2026-10-05: with the changes below there is one copy of React, the frontend builds, and the typecheck shows only the baseline error. Without `overrides`, Bun nests React 18 under `next-themes` and `@tanstack/react-store`, whose declared peer ranges stop at 18. Runtime behaviour in a browser has **not** been tested; Step 6 does that.

**Files:**
- Modify: `frontend/package.json`, `package.json`, `bun.lockb`

**Interfaces:**
- Consumes: the shipped refactor from Task 1.
- Produces: `react` and `react-dom` at exactly `19.2.3`, one copy in `node_modules`.

- [ ] **Step 1: Branch**

```bash
git checkout main && git pull --ff-only
git checkout -b chore/react-19
```

- [ ] **Step 2: Set the versions in `frontend/package.json`**

In `dependencies`:

```json
    "react": "19.2.3",
    "react-dom": "19.2.3",
```

In `devDependencies`:

```json
    "@types/react": "~19.2.2",
    "@types/react-dom": "^19.2.0",
```

- [ ] **Step 3: Force a single copy from the root `package.json`**

Add this key after `"workspaces"`:

```json
  "overrides": {
    "react": "19.2.3",
    "react-dom": "19.2.3"
  },
```

- [ ] **Step 4: Install and confirm there is exactly one React**

```bash
bun install
bun install --frozen-lockfile
find node_modules -path '*node_modules/react/package.json' -exec grep -H '"version"' {} \;
find node_modules -path '*node_modules/react-dom/package.json' -exec grep -H '"version"' {} \;
```

Expected: each `find` prints exactly one line, `node_modules/react/package.json` and `node_modules/react-dom/package.json`, both `19.2.3`. Any nested copy means the override is not applied; stop and fix.

- [ ] **Step 5: Build and typecheck**

```bash
(cd frontend && bun run build)
(cd frontend && bunx tsc -p tsconfig.app.json --noEmit)
(cd server && bunx tsc --noEmit)
```

Expected: the build succeeds; the frontend typecheck prints only the baseline error; the server typecheck prints nothing.

- [ ] **Step 6: Check it in a browser locally**

Start both servers (`bun run dev` and `bun run dev:frontend`) and open http://localhost:5173 with the browser console open. Minh logs in. Check each of these, which between them exercise every library whose React support was forced:

- The wardrobe grid renders and the card edit panel opens and closes with its animation (framer-motion).
- The navigation menu or sheet opens and closes (Radix).
- On the create-item page, clearing a field shows its validation message, and submitting creates the item (TanStack Form and Router).
- A toast appears after creating and after deleting (sonner, next-themes).
- The profile page renders.
- The console shows no `Invalid hook call`, no `Cannot read properties of null (reading 'useState')`, and no new React errors.

If any check fails, do not ship. Report which library failed; the fix is to upgrade that library to a release that supports React 19, as a separate change.

- [ ] **Step 7: Confirm the backend image still builds**

Run: `docker build -t stylify-server:local -f server/Dockerfile .`
Expected: build succeeds (the lockfile changed, so the frozen install is re-checked).

- [ ] **Step 8: Commit**

```bash
git add package.json frontend/package.json bun.lockb
git commit -m "chore(frontend): upgrade to React 19.2.3 and force a single copy"
```

- [ ] **Step 9: Ask Minh, then ship**

Tell Minh: this push deploys the frontend and the backend (the root `package.json` changed). After a yes:

```bash
git checkout main
git merge --ff-only chore/react-19
git push origin main
gh run list --limit 4
```

Watch each new run with `gh run watch <run-id> --exit-status`.
Expected: both workflows succeed.

- [ ] **Step 10: Smoke-test the live site**

```bash
curl -s -o /dev/null -w 'site %{http_code}\n' https://stylify.space
curl -s -o /dev/null -w 'me %{http_code}\n' https://stylify.space/api/me
```

Expected: `site 200`, `me 401`. Then Minh repeats the Step 6 checks on https://stylify.space (a hard refresh first, to skip the cached bundle). If the live site is broken, revert per Global Constraints.

---

### Task 3: Bearer token verifier

**Files:**
- Create: `server/auth/bearer.ts`
- Test: `server/auth/bearer.test.ts`
- Modify: `server/package.json`, `bun.lockb` (adds `jose`), `package.json` (adds `test` script)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `class BearerAuthError extends Error`
  - `type KeyResolver = ReturnType<typeof createRemoteJWKSet> | ReturnType<typeof createLocalJWKSet>`
  - `type BearerVerifierConfig = { issuer: string | undefined; audience: string | undefined; jwks: KeyResolver | undefined }`
  - `createBearerVerifier(config: BearerVerifierConfig): (token: string) => Promise<{ id: string }>` — resolves with the token's `sub` as `id`; rejects with `BearerAuthError` for every failure.

- [ ] **Step 1: Branch and add `jose`**

```bash
git checkout main && git pull --ff-only
git checkout -b feat/bearer-auth
(cd server && bun add jose)
```

Expected: `server/package.json` lists `jose` under `dependencies`; `bun.lockb` is modified.

- [ ] **Step 2: Add the test script to the root `package.json`**

In `"scripts"`, add the last line shown (and the comma before it):

```json
  "scripts": {
    "start": "bun server/index.ts",
    "dev": "bun --watch server/index.ts",
    "dev:frontend": "cd frontend && bun run dev",
    "dev:all": "bun run dev & bun run dev:frontend",
    "test": "bun test server"
  }
```

- [ ] **Step 3: Write the failing tests**

Create `server/auth/bearer.test.ts`:

```ts
import { beforeAll, describe, expect, test } from 'bun:test'
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose'
import { BearerAuthError, createBearerVerifier, type KeyResolver } from './bearer'

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

  test('rejects garbage and the empty string', async () => {
    await expect(verifier()('not-a-jwt')).rejects.toBeInstanceOf(BearerAuthError)
    await expect(verifier()('')).rejects.toBeInstanceOf(BearerAuthError)
  })

  test('rejects when audience is not configured', async () => {
    const verify = verifier({ audience: undefined })
    await expect(verify(await makeToken())).rejects.toBeInstanceOf(BearerAuthError)
  })

  test('rejects when issuer or key set is not configured', async () => {
    const token = await makeToken()
    await expect(verifier({ issuer: undefined })(token)).rejects.toBeInstanceOf(BearerAuthError)
    await expect(verifier({ jwks: undefined })(token)).rejects.toBeInstanceOf(BearerAuthError)
  })

  test('rejects when the key set cannot be loaded', async () => {
    const failing = (async () => {
      throw new Error('network down')
    }) as unknown as KeyResolver
    await expect(verifier({ jwks: failing })(await makeToken())).rejects.toBeInstanceOf(BearerAuthError)
  })
})
```

- [ ] **Step 4: Run the tests to see them fail**

Run: `bun test server/auth/bearer.test.ts`
Expected: FAIL, with an error that `./bearer` cannot be found.

- [ ] **Step 5: Write the implementation**

Create `server/auth/bearer.ts`:

```ts
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
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `bun test server/auth/bearer.test.ts`
Expected: PASS, 14 tests, 0 failures.

If "rejects a token with no expiry" fails, the installed `jose` does not honour `requiredClaims`; check `payload.exp === undefined` after `jwtVerify` and throw `BearerAuthError('Token has no expiry')`.

- [ ] **Step 7: Typecheck and commit**

```bash
(cd server && bunx tsc --noEmit)
git add server/auth/bearer.ts server/auth/bearer.test.ts server/package.json package.json bun.lockb
git commit -m "feat(server): verify Kinde access tokens sent as bearer tokens"
```

Expected: the typecheck prints nothing.

---

### Task 4: `getUser` middleware with bearer and cookie paths

**Files:**
- Create: `server/auth/getUser.ts`
- Test: `server/auth/getUser.test.ts`
- Modify: `server/kinde.ts`, `frontend/src/routes/_authenticated/profile.tsx:128-137`, `.github/workflows/deploy-backend.yml`

**Interfaces:**
- Consumes: `createBearerVerifier`, `BearerVerifierConfig` from `server/auth/bearer.ts` (Task 3).
- Produces:
  - `type AuthUser = { id: string; given_name?: string; family_name?: string; email?: string; picture?: string | null }`
  - `type AuthEnv = { Variables: { user: AuthUser } }`
  - `type GetUserDeps = { verifyBearer: (token: string) => Promise<AuthUser>; cookieAuth: (c: Context) => Promise<AuthUser | null> }`
  - `bearerToken(header: string | undefined): string | null` — `null` when the header is absent or not a bearer header; otherwise the token, which may be `''`.
  - `createGetUser(deps: GetUserDeps)` — Hono middleware that sets `c.var.user`.
  - `server/kinde.ts` still exports `getUser`, `kindeClient`, `sessionManager`; route files do not change.
  - Responses: bearer failure is `401 {"error":"Invalid token"}`; cookie failure is `401 {"error":"Not authenticated"}` (unchanged).

- [ ] **Step 1: Write the failing tests**

Create `server/auth/getUser.test.ts`:

```ts
import { describe, expect, mock, test } from 'bun:test'
import { Hono } from 'hono'
import { bearerToken, createGetUser, type AuthUser, type GetUserDeps } from './getUser'

const COOKIE_USER: AuthUser = { id: 'kp_cookie', given_name: 'Minh', family_name: 'Le', email: 'm@example.com', picture: null }

function setup(overrides: Partial<GetUserDeps> = {}) {
  const deps = {
    verifyBearer: mock(async (token: string): Promise<AuthUser> => {
      if (token === 'good') return { id: 'kp_bearer' }
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
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `bun test server/auth/getUser.test.ts`
Expected: FAIL, with an error that `./getUser` cannot be found.

- [ ] **Step 3: Write the middleware**

Create `server/auth/getUser.ts`:

```ts
import { type Context } from 'hono'
import { createMiddleware } from 'hono/factory'

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
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `bun test server/auth/getUser.test.ts`
Expected: PASS, 11 tests, 0 failures.

- [ ] **Step 5: Wire the real dependencies in `server/kinde.ts`**

Replace the imports at the top of the file (lines 1-4) with:

```ts
import {createKindeServerClient, GrantType, type SessionManager} from "@kinde-oss/kinde-typescript-sdk";
import { type Context } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { createRemoteJWKSet } from "jose";
import { createBearerVerifier } from "./auth/bearer";
import { createGetUser, type AuthUser } from "./auth/getUser";
```

Leave `kindeClient`, `store` and `sessionManager` as they are. Replace everything from `type Env = {` to the end of the file with:

```ts
// The key set is fetched on first use and cached. Built only when the domain is
// set, so a missing variable disables bearer auth instead of crashing at import.
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
```

- [ ] **Step 6: Make the web profile page accept optional names**

`/api/me` now types the name fields as optional. In `frontend/src/routes/_authenticated/profile.tsx`, replace the `getInitials` function at the bottom of the file with:

```tsx
function getInitials(firstName?: string, lastName?: string) {
  return [firstName, lastName]
    .filter(Boolean)
    .join(' ')
    .split(' ')
    .map(part => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}
```

- [ ] **Step 7: Run everything**

```bash
bun test server
(cd server && bunx tsc --noEmit)
(cd frontend && bunx tsc -p tsconfig.app.json --noEmit)
(cd frontend && bun run build)
```

Expected: 25 tests pass; the server typecheck prints nothing; the frontend typecheck prints only the baseline error; the build succeeds.

- [ ] **Step 8: Check both paths against a local server**

```bash
bun server/index.ts &
SERVER_PID=$!
curl -s -w ' %{http_code}\n' --retry 10 --retry-connrefused --retry-delay 1 http://localhost:8080/api/me
curl -s -w ' %{http_code}\n' -H 'Authorization: Bearer garbage' http://localhost:8080/api/me
kill $SERVER_PID
```

Expected, in order: `{"error":"Not authenticated"} 401` and `{"error":"Invalid token"} 401`.

- [ ] **Step 9: Run the tests in CI before the image is built**

In `.github/workflows/deploy-backend.yml`, insert these steps directly after `- uses: actions/checkout@v4`:

```yaml
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.3.13

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Test
        run: bun test server
```

- [ ] **Step 10: Rebuild the image locally with the new dependency**

```bash
docker build -t stylify-server:local -f server/Dockerfile .
docker run --rm -d --name stylify-local -p 8081:8080 --env-file .env stylify-server:local
curl -s -w ' %{http_code}\n' --retry 10 --retry-connrefused --retry-delay 1 -H 'Authorization: Bearer garbage' http://localhost:8081/api/me
docker stop stylify-local
```

Expected: `{"error":"Invalid token"} 401`. This proves `jose` is installed in the image.

- [ ] **Step 11: Commit**

```bash
git add server/auth/getUser.ts server/auth/getUser.test.ts server/kinde.ts frontend/src/routes/_authenticated/profile.tsx .github/workflows/deploy-backend.yml
git commit -m "feat(server): accept bearer tokens in getUser alongside cookies"
```

- [ ] **Step 12: Ask Minh, then ship**

Tell Minh: this push deploys the backend and the frontend. After a yes:

```bash
git checkout main
git merge --ff-only feat/bearer-auth
git push origin main
gh run list --limit 4
```

Watch each new run with `gh run watch <run-id> --exit-status`.
Expected: both workflows succeed, and the backend run shows the `Test` step passing.

- [ ] **Step 13: Smoke-test the live site**

```bash
curl -s -o /dev/null -w 'site %{http_code}\n' https://stylify.space
curl -s -w ' %{http_code}\n' https://stylify.space/api/me
curl -s -w ' %{http_code}\n' -H 'Authorization: Bearer garbage' https://stylify.space/api/me
```

Expected: `site 200`, then `{"error":"Not authenticated"} 401`, then `{"error":"Invalid token"} 401`. Then ask Minh to log in on the web, open the profile page, create and delete an item, and log out. That confirms the cookie path is unchanged. A valid bearer token cannot be tested until the mobile app exists; that check belongs to the next plan.

---

### Task 5: Agent docs and stale references

Nothing here triggers a deploy: neither workflow watches `docs/`, `AGENTS.md`, `CLAUDE.md` or `README.md`.

**Files:**
- Create: `AGENTS.md`
- Replace: `CLAUDE.md`
- Modify: `docs/cloud-architecture.md`, `docs/backend.md`, `docs/zod.md`, `docs/hono-rpc.md`, `docs/data-flow.md`, `docs/tanstack.md`, `README.md`

**Interfaces:**
- Consumes: the file layout and commands from Tasks 1-4.
- Produces: `AGENTS.md` as the single source of agent instructions.

- [ ] **Step 1: Branch**

```bash
git checkout main && git pull --ff-only
git checkout -b docs/agents-and-stale-references
```

- [ ] **Step 2: Create `AGENTS.md`**

````markdown
# Stylify

A personal wardrobe app, live at https://stylify.space. Users sign in, upload photos of clothing, and manage their wardrobe. It is a portfolio project first and a daily-use app second. A native iPhone app (Expo, in `mobile/`) is planned; see `docs/superpowers/specs/` for the current design and roadmap.

## Layout

```
server/     Hono API on Bun. Deployed as a Lambda container.
frontend/   React 19 + Vite SPA. Deployed to S3 behind CloudFront.
shared/     @stylify/shared: Zod schemas and types used by server and frontend.
drizzle/    SQL migrations (generated; do not hand-edit).
docs/       Architecture docs. Read the relevant one before changing that area.
```

`server`, `frontend` and `shared` are Bun workspaces with one lockfile at the root (`bun.lockb`).

| Path | What it is |
|---|---|
| `server/app.ts` | Registers every route under `/api`; exports the `ApiRoutes` type |
| `server/kinde.ts` | Kinde client, cookie session, and the `getUser` middleware |
| `server/auth/` | Bearer-token verifier and the `getUser` factory, with tests |
| `server/routes/` | `auth`, `wardrobe`, `signedUrl`, `recommendations` |
| `server/db/schema/items.ts` | The only table |
| `shared/src/index.ts` | `createItemSchema`, `OutfitSuggestion` |
| `frontend/src/lib/api.ts` | Typed Hono client and every `queryOptions` |
| `frontend/src/routes/` | TanStack Router file routes; `_authenticated.tsx` is the auth guard |

## Commands

Bun is pinned to 1.3.13 locally, in CI and in the Dockerfile.

```bash
bun install                      # all workspaces, from the root
bun run dev                      # API on :8080
bun run dev:frontend             # Vite on :5173, proxies /api to :8080
bun test server                  # server tests
(cd server && bunx tsc --noEmit) # server typecheck
(cd frontend && bun run build)   # frontend build
```

Schema changes: edit `server/db/schema/items.ts`, run `bun drizzle-kit generate`, then `bun migrate.ts`.

## Rules that are easy to break

- **Pushing to `main` deploys.** Changes under `server/`, `shared/`, `frontend/` or the root `package.json` trigger the GitHub Actions workflows, which update the live site. Ask the owner before pushing to `main`. Work on a branch and fast-forward.
- **Both deploys install with `--frozen-lockfile`.** After changing any `package.json`, run `bun install` at the root and commit `bun.lockb`, or the deploy fails.
- **The Dockerfile must copy the `package.json` of every workspace** listed in the root `package.json`. Bun stops with `Workspace not found` otherwise. If you add a workspace, add its manifest to `server/Dockerfile` and check the image builds: `docker build -f server/Dockerfile .`
- **Before pushing a backend change,** build the image and confirm `GET /api/me` returns 401 from the container. `docs/cloud-architecture.md` has the commands.
- **React is pinned to one exact version** (`react` and `react-dom`, in `frontend/package.json` and root `overrides`). It must equal the version the Expo SDK in `mobile/` requires; two copies of React in one app break hooks at runtime. Change it only together with an Expo SDK upgrade, and check `find node_modules -path '*node_modules/react/package.json'` prints one line.
- **Never print or commit `.env` values.**

## Patterns

- **Auth has two paths, chosen in `getUser`.** With an `Authorization: Bearer` header, the token is verified against Kinde's JWKS (issuer, audience, expiry) and only `user.id` is available; a failure is a 401 and never falls back to cookies. Without one, the httpOnly cookies set by `/api/callback` are used and the full profile is available. Route handlers should rely on `c.var.user.id` only.
- **Hono RPC.** The frontend calls the API through `hc<ApiRoutes>`; do not write raw `fetch` calls to `/api`.
- **Validation in three layers,** all from `createItemSchema` in `@stylify/shared`: TanStack Form in the browser, `zValidator` on the route, and database constraints.
- **Cache updates.** Mutations write the server's response into the cache with `queryClient.setQueryData` after it succeeds. There are no optimistic updates.
- **Images.** The browser uploads straight to S3 using a presigned URL from `GET /api/signed-url`; the API never receives the file.

## Deployment

- Frontend: S3 bucket `stylify-frontend` (us-east-1), CloudFront distribution `EIH8J5L7N96GZ`.
- Backend: Lambda `stylifyServer` (us-east-1) from ECR `wardrobe-app`, behind API Gateway HTTP API `qc21edd692`.
- Images: S3 bucket `stylify-local-minh` (us-east-2).
- CloudFront sends `/api/*` to API Gateway and everything else to S3. The `/api/*` behaviour must use the `AllViewerExceptHostHeader` origin request policy; `AllViewer` makes API Gateway return 403.
- Lambda environment variables: `DATABASE_URL`, `KINDE_DOMAIN`, `KINDE_CLIENT_ID`, `KINDE_CLIENT_SECRET`, `KINDE_REDIRECT_URI`, `KINDE_LOGOUT_REDIRECT_URI`, `KINDE_AUDIENCE`, `FRONTEND_URL`, `AWS_BUCKET_NAME`, `AWS_BUCKET_REGION`, `GEMINI_API_KEY`.

Smoke test after any deploy:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://stylify.space          # 200
curl -s -o /dev/null -w '%{http_code}\n' https://stylify.space/api/me   # 401
```

Then, in a browser: log in, create an item, edit it, delete it, log out.

## Docs

| File | Covers |
|---|---|
| `docs/backend.md` | Hono setup, endpoints, auth, S3 |
| `docs/database.md` | Neon, Drizzle, schema, migrations |
| `docs/frontend.md` | Routing, auth guard, pages, components |
| `docs/tanstack.md` | Query and Form usage, cache patterns |
| `docs/zod.md` | The shared schema and validation chain |
| `docs/hono-rpc.md` | The end-to-end type chain |
| `docs/data-flow.md` | Request traces, Vite proxy |
| `docs/cloud-architecture.md` | Lambda, API Gateway, S3, CloudFront, DNS, manual deploy |
| `docs/superpowers/specs/` | Design specs, including the roadmap |
| `docs/superpowers/plans/` | Implementation plans |
````

- [ ] **Step 3: Replace `CLAUDE.md` with an import**

The whole file becomes:

```markdown
@AGENTS.md
```

- [ ] **Step 4: Fix the shared-schema references**

```bash
sed -i '' -e "s#@server/sharedTypes#@stylify/shared#g" -e "s#server/sharedTypes\.ts#shared/src/index.ts#g" \
  docs/zod.md docs/hono-rpc.md docs/data-flow.md docs/tanstack.md
grep -rn "sharedTypes" docs/*.md README.md
```

Expected: `grep` prints only `README.md:28`. In `README.md`, delete that `│   ├── sharedTypes.ts       # Zod schemas shared with frontend` line and add this line at the same level as `server/` in the tree:

```
├── shared/                  # @stylify/shared: Zod schemas used by server and frontend
```

In `docs/data-flow.md`, the diagram near line 289 reads as if the shared schema is derived from the Drizzle table. Replace these three lines:

```
server/db/schema/items.ts      Drizzle table + createInsertSchema()
        ↓
shared/src/index.ts          .omit({ userId, createdAt, id }) → createItemSchema
```

with:

```
shared/src/index.ts            createItemSchema (the client contract)
        ↓
server/db/schema/items.ts      insertItemsSchema = createItemSchema + userId
```

- [ ] **Step 5: Fix `docs/cloud-architecture.md`**

Make these edits:

1. Replace the Dockerfile code block under "The `server/Dockerfile` is the packing instructions" with the Dockerfile from Task 1, Step 4.
2. In "Deployment Commands", replace the three numbered commands with:

    ```bash
    # 1. Create the ECR repository (one time only)
    aws ecr create-repository --repository-name wardrobe-app --region us-east-1

    # 2. Authenticate Docker to ECR
    aws ecr get-login-password --region us-east-1 | \
      docker login --username AWS --password-stdin 779846779460.dkr.ecr.us-east-1.amazonaws.com

    # 3. Build and push the image (run from repo root)
    docker build --platform linux/amd64 --provenance=false \
      -t 779846779460.dkr.ecr.us-east-1.amazonaws.com/wardrobe-app:latest \
      -f server/Dockerfile .
    docker push 779846779460.dkr.ecr.us-east-1.amazonaws.com/wardrobe-app:latest
    ```

3. Replace the environment variable list under "Lambda Configuration" with:

    ```markdown
    **Environment variables** (set in Lambda config, never in code):
    - `DATABASE_URL`
    - `KINDE_DOMAIN`, `KINDE_CLIENT_ID`, `KINDE_CLIENT_SECRET`
    - `KINDE_REDIRECT_URI`, `KINDE_LOGOUT_REDIRECT_URI`
    - `KINDE_AUDIENCE` (the API audience registered in Kinde; bearer tokens are rejected without it)
    - `FRONTEND_URL`
    - `AWS_BUCKET_NAME`, `AWS_BUCKET_REGION`
    - `GEMINI_API_KEY`

    S3 access comes from the Lambda execution role, not from access keys.
    ```

4. In the S3 section, change `aws s3 mb s3://stylify-frontend-yourname --region us-east-2` to `aws s3 mb s3://stylify-frontend --region us-east-1`, change `aws s3 sync dist/ s3://stylify-frontend-yourname/` to `aws s3 sync dist/ s3://stylify-frontend/`, and in the CloudFront section change both mentions of the bucket being in `us-east-2` (Ohio) to `us-east-1` (Virginia), including the `S3 bucket (Ohio)` label in the diagram.
5. Replace the two rows of the workflow table with:

    ```markdown
    | Deploy Backend | `deploy-backend.yml` | Push to `main` touching `server/`, `shared/`, the root `package.json`, or the workflow file. Runs `bun test server` first. |
    | Deploy Frontend | `deploy-frontend.yml` | Push to `main` touching `frontend/`, `shared/`, the root `package.json`, or the workflow file |
    ```

6. Directly above "Smoke Tests After Deploy", add:

    ````markdown
    ### Check the Image Locally Before Pushing

    ```bash
    docker build -t stylify-server:local -f server/Dockerfile .
    docker run --rm -d --name stylify-local -p 8081:8080 --env-file .env stylify-server:local
    curl -s -o /dev/null -w '%{http_code}\n' --retry 10 --retry-connrefused --retry-delay 1 http://localhost:8081/api/me   # 401
    docker stop stylify-local
    ```
    ````

Run: `grep -n "us-east-2\|stylify-backend\|yourname" docs/cloud-architecture.md`
Expected: no output.

- [ ] **Step 6: Document bearer auth in `docs/backend.md`**

Insert this section directly before the `### Full Auth Flow` heading:

```markdown
### Bearer Tokens (Mobile)

`getUser` also accepts a Kinde access token in the `Authorization: Bearer <token>` header. This is how the mobile app authenticates, since a native app has no cookie session with the API.

The code is in `server/auth/`:

- `bearer.ts` verifies the token with `jose`: signature against Kinde's JWKS (`<KINDE_DOMAIN>/.well-known/jwks`, fetched once and cached), issuer equal to `KINDE_DOMAIN`, audience equal to `KINDE_AUDIENCE`, algorithm RS256, and an unexpired `exp`. The user ID is the token's `sub` claim.
- `getUser.ts` chooses the path. A bearer header that fails verification returns `401 {"error":"Invalid token"}` and never falls back to cookies. With no bearer header, the cookie logic above runs unchanged.

On the bearer path only `c.var.user.id` is set; access tokens carry no name or email. Route handlers should use `user.id` only.

If `KINDE_AUDIENCE` is not set, every bearer request is rejected and cookie auth keeps working.
```

Then, in the `## Environment Variables` section of the same file, add `KINDE_AUDIENCE` alongside the other Kinde variables, in the format that section already uses, described as "API audience registered in Kinde; required for bearer tokens".

- [ ] **Step 7: Commit, then merge after asking Minh**

```bash
git add AGENTS.md CLAUDE.md README.md docs
git commit -m "docs: add AGENTS.md, document bearer auth, fix stale references"
```

Tell Minh this push changes docs only and triggers no deploy. After a yes:

```bash
git checkout main
git merge --ff-only docs/agents-and-stale-references
git push origin main
gh run list --limit 2
```

Expected: no new workflow runs appear for this push.

---

### Task 6: Register the API audience and set it on Lambda

Manual steps for Minh, with the agent guiding. Bearer auth rejects every token until this is done; the web app is unaffected either way. It must be finished before the mobile plan starts.

**Files:** none.

**Interfaces:**
- Consumes: the deployed backend from Task 4.
- Produces: audience `https://stylify.space/api` registered in Kinde, and `KINDE_AUDIENCE` set on the `stylifyServer` Lambda.

- [ ] **Step 1: Register the API in Kinde (Minh)**

In the Kinde dashboard for the same business the web app uses: open the APIs page under Settings, choose "Add API", name it `Stylify API`, and set the audience to exactly `https://stylify.space/api`. Save. Kinde's docs cover this under "Register and manage APIs".

The mobile application is created and authorised for this API in the next plan, once its redirect URI is known.

- [ ] **Step 2: Refresh AWS credentials (Minh)**

The local AWS CLI session had expired on 2026-10-05. Minh signs in again, then:

Run: `aws sts get-caller-identity --query Account --output text`
Expected: `779846779460`

- [ ] **Step 3: Add the variable without disturbing the others**

`update-function-configuration --environment` replaces the whole set, so read, merge, and write back. The files hold secrets: keep them in a temporary directory and delete them.

```bash
TMP=$(mktemp -d)
aws lambda get-function-configuration --function-name stylifyServer --region us-east-1 \
  --query 'Environment.Variables' --output json > "$TMP/vars.json"
jq 'keys' "$TMP/vars.json"     # names only; confirm the existing variables are all there
jq '{Variables: (. + {KINDE_AUDIENCE: "https://stylify.space/api"})}' "$TMP/vars.json" > "$TMP/env.json"
jq '.Variables | keys' "$TMP/env.json"
```

Expected: the second list equals the first plus `KINDE_AUDIENCE`. Show Minh both lists and get a yes, then:

```bash
aws lambda update-function-configuration --function-name stylifyServer --region us-east-1 \
  --environment "file://$TMP/env.json" --query 'LastUpdateStatus' --output text
rm -rf "$TMP"
```

Expected: `InProgress` or `Successful`.

Alternative: Minh adds `KINDE_AUDIENCE` = `https://stylify.space/api` in the Lambda console under Configuration, Environment variables.

- [ ] **Step 4: Confirm the live site still works**

```bash
curl -s -o /dev/null -w 'site %{http_code}\n' https://stylify.space
curl -s -w ' %{http_code}\n' https://stylify.space/api/me
curl -s -w ' %{http_code}\n' -H 'Authorization: Bearer garbage' https://stylify.space/api/me
```

Expected: `site 200`, `{"error":"Not authenticated"} 401`, `{"error":"Invalid token"} 401`. Ask Minh to log in on the web once more to confirm the variable change did not disturb cookie auth.

- [ ] **Step 5: Add `KINDE_AUDIENCE` to the local `.env` (Minh)**

Minh adds the line `KINDE_AUDIENCE=https://stylify.space/api` to `.env` so local development matches production. `.env` is git-ignored; nothing to commit.
