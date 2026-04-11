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

## Current Deployment (EC2 — being migrated)
- Runs on EC2 t3.micro + PM2, port 8080
- Domain via Porkbun DNS
- Costs ~$12/month (EC2 + public IPv4)

## Planned: Serverless Migration (not yet done)
Migrating to Lambda + API Gateway + S3 + CloudFront to reduce bill to ~$0.15/month.
- `server/Dockerfile` is already set up with AWS Lambda Adapter (no Hono code changes needed)
- `.dockerignore` at repo root is set up for building from repo root
- See `docs/cloud-architecture.md` for the full plan and deployment checklist

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
