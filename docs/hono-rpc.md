# Hono RPC — Type-Safe API Client

## What is REST?

In a traditional REST API, the frontend and backend are completely separate. The frontend calls URLs and parses responses manually:

```ts
// Traditional REST — frontend has no idea what the API returns
const res = await fetch('/api/wardrobe')
const data = await res.json()  // typed as `any` — no safety

// If the backend renames `items` to `clothingItems`, TypeScript won't warn you
// You find out at runtime when the UI breaks
console.log(data.items)  // might be undefined!
```

The contract between client and server lives only in documentation or convention. TypeScript can't help you because `fetch` returns `any`.

---

## What is Hono RPC?

**Hono RPC** is a feature of the Hono framework that generates a fully type-safe client from your route definitions. Instead of calling `fetch` with a URL string, you call typed methods on a client object — and TypeScript knows exactly what parameters each endpoint accepts and what it returns.

### How it works

**Step 1 — Backend exports its route types**

```ts
// server/app.ts
const app = new Hono()
  .route('/api', authRoutes)
  .route('/api', wardrobeRoutes)
  .route('/api', signedUrlRoutes)

export type AppType = typeof app  // ← the entire API shape as a TypeScript type
```

**Step 2 — Frontend creates a typed client**

```ts
// frontend/src/lib/api.ts
import { hc } from 'hono/client'
import type { AppType } from '../../server/app'

export const api = hc<AppType>('/')
```

`hc<AppType>` creates a proxy object that mirrors the exact structure of your Hono routes.

**Step 3 — Call endpoints like typed functions**

```ts
// Instead of: fetch('/api/wardrobe')
const res = await api.wardrobe.$get()
const data = await res.json()
// data is typed as { items: { id: number, name: string, ... }[] }
// TypeScript knows the exact shape — no `any`!

// For endpoints with params:
const res = await api.wardrobe[':id'].$get({ param: { id: '42' } })

// For POST with a body:
const res = await api.wardrobe.$post({ json: { name: 'T-Shirt', type: 'Top', ... } })
```

If you get the parameter name wrong, or send the wrong body shape, **TypeScript catches it at compile time**, not at runtime.

---

## REST vs Hono RPC — Side by Side

| Concern | Traditional REST | Hono RPC |
|---|---|---|
| URL construction | Hardcoded strings (`'/api/wardrobe/' + id`) | Type-safe method chaining (`api.wardrobe[':id']`) |
| Request body | Manually typed or `any` | Inferred from Zod validator on the route |
| Response type | `any` (needs manual casting or a shared type file) | Fully inferred from the route handler's return type |
| Refactoring safety | Rename an endpoint → must grep codebase and hope you caught everything | Rename an endpoint → TypeScript errors everywhere it's called |
| Docs | Need OpenAPI, Swagger, or comments | TypeScript IntelliSense IS the documentation |
| Runtime overhead | None (plain `fetch`) | None (RPC client is just a proxy — it still calls `fetch` under the hood) |

---

## Why This Was Used Here

1. **End-to-end type safety with zero duplication.** The Zod schemas on the backend flow through the Hono route types and are automatically known by the frontend client. There's no separate type file to maintain.

2. **Refactoring confidence.** If you rename a route or change a response shape, every call site in the frontend becomes a TypeScript error immediately — you can't forget to update the client.

3. **No code generation step.** Unlike OpenAPI/Swagger codegen (which generates client code from a spec file and needs to be re-run), Hono RPC works purely through TypeScript's type inference. It's always up to date automatically.

4. **Same dev experience as calling a local function.** Autocomplete works on route paths, parameters, and response properties — the API feels like a typed library, not a remote service.

---

## The Full Type Chain

```
server/db/schema/items.ts        (Drizzle table definition)
        ↓  drizzle-zod
server/db/schema/items.ts        (insertItemsSchema — Zod schema)
        ↓  .omit({ userId, createdAt, id })
server/sharedTypes.ts            (createItemSchema — public-facing schema)
        ↓  zValidator('json', createItemSchema) on the Hono route
server/routes/wardrobe.ts        (route handler with validated input type)
        ↓  export type AppType = typeof app
server/app.ts                    (AppType — full API type)
        ↓  hc<AppType>('/')
frontend/src/lib/api.ts          (api — typed RPC client)
        ↓  api.wardrobe.$post({ json: value })
frontend/src/routes/...          (fully typed call sites)
```

Every layer flows into the next through TypeScript's type system. You change the DB schema, and the type error propagates all the way to the frontend call site automatically.
