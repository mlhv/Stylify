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
bun test ./server                # server tests
(cd server && bunx tsc --noEmit) # server typecheck
(cd frontend && bun run typecheck) # frontend typecheck (also runs in CI before the build)
(cd frontend && bun run build)   # frontend build (does not typecheck)
```

Schema changes: edit `server/db/schema/items.ts`, run `bun drizzle-kit generate`, then `bun migrate.ts`.

## Rules that are easy to break

- **Pushing to `main` deploys.** Changes under `server/`, `shared/`, `frontend/` or the root `package.json` trigger the GitHub Actions workflows, which update the live site. Ask the owner before pushing to `main`. Work on a branch and fast-forward. A lockfile-only change does not deploy, so a re-resolved transitive server dependency ships with the next server deploy.
- **Both deploys install with `--frozen-lockfile`.** After changing any `package.json`, run `bun install` at the root and commit `bun.lockb`, or the deploy fails.
- **The Dockerfile must copy the `package.json` of every workspace** listed in the root `package.json`. Bun stops with `Workspace not found` otherwise. If you add a workspace, add its manifest to `server/Dockerfile` and check the image builds: `docker build -f server/Dockerfile .`
- **Before pushing a backend change,** build the image and confirm `GET /api/me` returns 401 from the container. `docs/cloud-architecture.md` has the commands.
- **React is pinned to one exact version** (`react` and `react-dom`, in `frontend/package.json` and root `overrides`). It must equal the version the Expo SDK in `mobile/` requires; two copies of React in one app break hooks at runtime. Change it only together with an Expo SDK upgrade, and check `find node_modules -path '*node_modules/react/package.json'` prints one line.
- **Typecheck the frontend yourself.** `vite build` does not typecheck; `bun run typecheck` in `frontend/` does, and the frontend deploy runs it before building, so a type error blocks the deploy. The frontend's `tsconfig` also checks the server files it imports types from, with `noUnusedLocals` on, so an unused variable in `server/` can fail the frontend typecheck.
- **`@tanstack/react-form` and `@tanstack/zod-form-adapter` must be on the same minor version** (both 0.32 today). A mismatch still runs but breaks the form validator types.
- **Routes that return `c.notFound()` lose their response type in the RPC client.** `frontend/src/lib/api.ts` asserts those results to the `Item` type; keep that in mind when changing what `GET`/`PUT /api/wardrobe/:id` return.
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
- Lambda environment variables: `DATABASE_URL`, `KINDE_DOMAIN`, `KINDE_CLIENT_ID`, `KINDE_CLIENT_SECRET`, `KINDE_REDIRECT_URI`, `KINDE_LOGOUT_REDIRECT_URI`, `KINDE_AUDIENCE` (required for bearer auth; may not be set yet, and bearer requests are rejected until it is), `FRONTEND_URL`, `AWS_BUCKET_NAME`, `AWS_BUCKET_REGION`, `GEMINI_API_KEY`.

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
