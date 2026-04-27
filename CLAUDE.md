# Stylify — Claude Context

## What This Is
A personal wardrobe CRUD app. Users log in, upload photos of clothing items, and manage their wardrobe. Built as a project to learn modern TypeScript full-stack tooling.

## Tech Stack
| Layer | Technology |
|---|---|
| Runtime | Bun |
| Backend | Hono (API only — no static file serving) |
| Frontend | React 18 + Vite |
| Routing | TanStack Router (file-based, auto-generated `routeTree.gen.ts`) |
| Server state | TanStack Query |
| Forms | TanStack Form + Zod (`@tanstack/zod-form-adapter`) |
| Database | Neon (serverless Postgres) via Drizzle ORM |
| Auth | Kinde (OAuth 2.0 Authorization Code flow, httpOnly cookies) |
| Image storage | AWS S3 (presigned URL — browser uploads directly, backend not in path) |
| Styling | Tailwind CSS + Radix UI (shadcn/ui pattern) |

## Running Locally
```bash
# Install deps
bun install
cd frontend && bun install && cd ..

# Build frontend (backend does NOT serve static files — Vite proxy handles /api in dev)
cd frontend && bun run build && cd ..

# Start backend (port 8080)
bun run dev
# Frontend dev server (port 5173, proxies /api → :8080)
cd frontend && bun run dev
```

Note: Vite proxy in `frontend/vite.config.ts` forwards `/api/*` to the backend to avoid CORS issues in dev. In production this is handled by CloudFront path routing.

## Key File Locations
```
server/
  app.ts              Hono app — registers all routes under /api
  index.ts            Bun server entry point (exports fetch handler)
  kinde.ts            Kinde client + getUser middleware (auth guard)
  sharedTypes.ts      createItemSchema — shared Zod schema used by frontend + backend
  routes/
    auth.ts           /login /register /callback /logout /me
    wardrobe.ts       CRUD endpoints for clothing items
    signedUrl.ts      S3 presigned URL generation
  db/
    index.ts          Drizzle + Neon connection
    schema/items.ts   items table definition + Zod schemas (single table app)

frontend/src/
  main.tsx            QueryClient + Router bootstrap
  lib/api.ts          Hono RPC client (hc<AppType>) + all queryOptions definitions
  routes/
    __root.tsx              Root layout + NavBar
    _authenticated.tsx      Auth guard (beforeLoad fetches user, shows Login if null)
    _authenticated/
      index.tsx             Wardrobe grid (home page)
      create-item.tsx       Create form — S3 upload then POST /api/wardrobe
      edit-item.$id.tsx     Edit form
      profile.tsx           User profile + logout
```

## Important Patterns
- **Auth:** Kinde sets httpOnly cookies on `/api/callback`. Frontend never touches tokens directly. All protected routes use `getUser` middleware server-side.
- **Hono RPC:** Frontend uses `hc<AppType>` from `hono/client` — fully type-safe, no manual fetch calls. `AppType` exported from `server/app.ts`.
- **Validation:** Three layers — Zod in TanStack Form (frontend, per keystroke) → `zValidator` middleware (backend, before handler) → Postgres NOT NULL constraints (DB). All use `createItemSchema` from `server/sharedTypes.ts`.
- **Cache updates:** Mutations manually call `queryClient.setQueryData()` instead of refetching. No optimistic rollback — updates are confirmed before cache is touched.
- **Single DB table:** Only one table (`items`) with columns: id, user_id, name, size, type, color, created_at, image_url.

## Current Deployment (Serverless — live at stylify.space)
- **Frontend:** S3 bucket `stylify-frontend` (us-east-1) + CloudFront distribution `EIH8J5L7N96GZ`
- **Backend:** Lambda (us-east-1) + API Gateway HTTP API `qc21edd692` → container from ECR `wardrobe-app`
- **Images:** S3 bucket `stylify-local-minh` (us-east-2), presigned URL upload, CORS allows `stylify.space`
- **Routing:** CloudFront `/api/*` → API Gateway, `/*` → S3. Origin request policy must be `AllViewerExceptHostHeader` on the `/api/*` behavior — `AllViewer` causes API Gateway to return 403 (Host header mismatch)
- **DNS:** Porkbun ALIAS `stylify.space` → CloudFront, ACM cert in us-east-1
- **Costs:** ~$0.15/month (down from ~$12/month on EC2)
- **EC2:** Terminated. Migration complete.

## Deploying Changes
CI/CD is handled by GitHub Actions (`.github/workflows/`):
- **Backend:** push to `main` with changes in `server/` auto-triggers the backend workflow (build Docker image → push to ECR → update Lambda). Can also trigger manually in the Actions tab.
- **Frontend:** push to `main` with changes in `frontend/` auto-triggers the frontend workflow (Vite build → S3 sync → CloudFront invalidation).

See `docs/cloud-architecture.md` for the manual deploy commands (useful if CI is broken).

## Documentation
All architecture docs are in `docs/`:
| File | Covers |
|---|---|
| `docs/backend.md` | Hono setup, all API endpoints, Kinde auth flow, S3 |
| `docs/database.md` | Neon, Drizzle ORM, schema, migrations, query patterns |
| `docs/frontend.md` | TanStack Router, auth guard, pages, Radix UI components |
| `docs/tanstack.md` | Why TanStack Query/Form, query definitions, cache patterns |
| `docs/zod.md` | What Zod is, the shared schema, validation chain |
| `docs/hono-rpc.md` | Hono RPC vs REST, the full type chain |
| `docs/data-flow.md` | End-to-end request traces, Vite proxy, validation layers |
| `docs/cloud-architecture.md` | Docker/ECR, Lambda, API Gateway, S3/CloudFront, domain setup |
