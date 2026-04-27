# Stylify — Virtual Wardrobe App

A full-stack wardrobe management app that lets you catalog, organize, and manage your clothing items with images. Built as a personal project to explore modern TypeScript tooling end-to-end.

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | [Bun](https://bun.sh) |
| Backend | [Hono](https://hono.dev) |
| Frontend | React 18 + Vite |
| Routing | TanStack Router (file-based) |
| Server State | TanStack Query |
| Forms | TanStack Form + Zod |
| Database | Neon (serverless Postgres) via Drizzle ORM |
| Auth | Kinde (OAuth 2.0 Authorization Code flow) |
| File Storage | AWS S3 (presigned uploads) |
| Styling | Tailwind CSS + Radix UI |

## Project Structure

```
Stylify/
├── server/                  # Hono backend (Bun)
│   ├── app.ts               # App entry, route registration
│   ├── index.ts             # Bun server bootstrap
│   ├── kinde.ts             # Kinde auth client + getUser middleware
│   ├── sharedTypes.ts       # Zod schemas shared with frontend
│   ├── routes/
│   │   ├── auth.ts          # /login /register /callback /logout /me
│   │   ├── wardrobe.ts      # CRUD endpoints for clothing items
│   │   └── signedUrl.ts     # S3 presigned URL generation
│   └── db/
│       ├── index.ts         # Drizzle + Neon connection
│       ├── schema/
│       │   └── items.ts     # items table definition + Zod schemas
│       └── migrations/      # Drizzle migration SQL files
├── frontend/                # React SPA (Vite)
│   └── src/
│       ├── main.tsx         # QueryClient + Router bootstrap
│       ├── routes/
│       │   ├── __root.tsx           # Root layout + NavBar
│       │   ├── _authenticated.tsx   # Auth guard layout
│       │   ├── about.tsx
│       │   └── _authenticated/
│       │       ├── index.tsx        # Wardrobe grid (home)
│       │       ├── create-item.tsx  # Create form
│       │       ├── edit-item.$id.tsx
│       │       └── profile.tsx
│       ├── lib/
│       │   └── api.ts       # Hono RPC client + all query options
│       └── components/
│           └── ui/          # Radix UI component wrappers
├── drizzle.config.ts        # DB migration configuration
└── docs/                    # Architecture documentation
```

## Running Locally

### Prerequisites
- [Bun](https://bun.sh) installed
- `.env` file with `DATABASE_URL`, `AWS_BUCKET_NAME`, `AWS_BUCKET_REGION`, and Kinde credentials

### Development

```bash
# Install backend dependencies
bun install

# Install frontend dependencies
cd frontend && bun install && cd ..

# Start the backend (port 8080)
bun run dev

# Start the frontend dev server (port 5173) — proxies /api/* to :8080
cd frontend && bun run dev
```

## Deployment

Deployments are automated via GitHub Actions (`.github/workflows/`):

| Workflow | Trigger | What it does |
|---|---|---|
| Deploy Backend | Push to `main` touching `server/` | Builds Docker image → pushes to ECR → updates Lambda |
| Deploy Frontend | Push to `main` touching `frontend/` | Vite build → S3 sync → CloudFront invalidation |

Both workflows can also be triggered manually from the **Actions** tab in GitHub. See [`docs/cloud-architecture.md`](docs/cloud-architecture.md) for infrastructure details and manual deploy commands.

## Documentation

| Topic | File |
|---|---|
| Backend (Hono, routes, auth) | [docs/backend.md](docs/backend.md) |
| Database (Neon, Drizzle, schema) | [docs/database.md](docs/database.md) |
| Frontend (routing, components) | [docs/frontend.md](docs/frontend.md) |
| TanStack Query & Form | [docs/tanstack.md](docs/tanstack.md) |
| Zod schemas | [docs/zod.md](docs/zod.md) |
| Hono RPC vs REST | [docs/hono-rpc.md](docs/hono-rpc.md) |
| Full data flow | [docs/data-flow.md](docs/data-flow.md) |
| Cloud architecture & deployment | [docs/cloud-architecture.md](docs/cloud-architecture.md) |
