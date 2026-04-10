# Full Data Flow — End to End

This document covers how the frontend and backend communicate, why the development
environment needs a proxy, how validation works at every layer, and traces the complete
lifecycle of each major user action through the app.

---

## System Map

```
Browser (React SPA)
    │
    │  httpOnly cookies (set by backend, sent automatically)
    │  Hono RPC calls (fetch under the hood, proxied via Vite in dev)
    ▼
Hono Backend (Bun, port 8080)
    │
    ├── Kinde SDK ──────────────────── Kinde Auth Server (OAuth)
    │
    ├── Drizzle ORM ────────────────── Neon (serverless Postgres)
    │
    └── AWS SDK ────────────────────── S3 (image storage)
```

---

## Part 1: Dev vs Production — Two Very Different Setups

### Development: Two Servers Running Side by Side

When developing locally, you run two completely separate servers at the same time:

```
┌──────────────────────────────┐    ┌──────────────────────────────┐
│  Vite Dev Server             │    │  Hono Backend                │
│  localhost:5173              │    │  localhost:8080              │
│                              │    │                              │
│  Serves your React app       │    │  Handles /api/* routes       │
│  Hot reloads when you save   │    │  Talks to DB, Kinde, S3      │
└──────────────────────────────┘    └──────────────────────────────┘
```

Your browser opens `localhost:5173` and gets the React app. But when the React app
needs data (like your wardrobe items), it needs to reach the backend at `localhost:8080`.

### The CORS Problem

Browsers have a built-in security rule called **CORS (Cross-Origin Resource Sharing)**:

> "A webpage can only freely talk to the same server it was loaded from."

`localhost:5173` and `localhost:8080` are considered **different origins** because they
use different ports. If the React app at `:5173` tried to call `http://localhost:8080/api/wardrobe`
directly, the browser would **block it** with a CORS error — before the request even leaves
the browser.

### Why the Vite Proxy Fixes This

Instead of calling the backend directly, the frontend calls **itself**. Vite intercepts
any request to `/api/*` and secretly forwards it to the backend:

```
❌ Without proxy:
Browser (5173) ──fetch──→ localhost:8080/api/wardrobe
                              Browser blocks this! CORS error.

✅ With proxy:
Browser (5173) ──fetch──→ localhost:5173/api/wardrobe
                              Vite sees /api/* → forwards to :8080
                              Backend responds
                              Vite hands response back to browser
                              Browser never knew it left port 5173
```

Configured in `frontend/vite.config.ts`:

```ts
server: {
  proxy: {
    '/api': {
      target: 'http://localhost:3000',  // backend port
      changeOrigin: true,
    }
  }
}
```

The proxy is purely a **development convenience**. It doesn't exist in production.

### Production: One Domain, No Proxy Needed

In production (CloudFront + S3 + Lambda), both the frontend files and the `/api/*`
routes are served from the same domain (`yourdomain.com`). Same origin — no CORS,
no proxy. CloudFront handles the routing internally based on the URL path.

```
Development                          Production
──────────────────────────────       ──────────────────────────────────────
localhost:5173  (Vite, React)        yourdomain.com/*     → CloudFront → S3
localhost:8080  (Hono, API)          yourdomain.com/api/* → CloudFront → Lambda
Vite proxy bridges the two           No proxy — same domain throughout
```

---

## Part 2: How Frontend Talks to Backend

### TanStack Query — The Smart Fetch Assistant

Components don't call `fetch` directly. They use **TanStack Query**, which acts like
a smart assistant: you tell it *what* you want, and it handles the how — making the
request, caching the result, tracking loading/error state, and reusing data across
components.

```ts
// In the home page component
const { data, isPending, error } = useQuery(getAllItemsQueryOptions)
//                                 ↑ TanStack Query manages everything from here
```

Without TanStack Query, you'd write this manually for every piece of data:

```ts
// The naive approach — don't do this
const [items, setItems] = useState([])
const [loading, setLoading] = useState(false)
const [error, setError] = useState(null)

useEffect(() => {
  setLoading(true)
  fetch('/api/wardrobe')
    .then(r => r.json())
    .then(data => { setItems(data.items); setLoading(false) })
    .catch(e => { setError(e); setLoading(false) })
}, [])
// And this has no caching — every component refetches independently
```

TanStack Query gives you caching, deduplication, background refetching, and loading/
error states for free.

### Hono RPC — Type-Safe API Calls

The actual HTTP call is made through the **Hono RPC client** (`api`), defined in
`frontend/src/lib/api.ts`. Under the hood it's still just `fetch`, but TypeScript
knows exactly what each endpoint accepts and returns:

```ts
// Hono RPC call (fully typed)
const res = await api.wardrobe.$get()
const data = await res.json()
// TypeScript knows data is: { items: { id: number, name: string, ... }[] }

// Equivalent raw fetch (no type safety)
const res = await fetch('/api/wardrobe')
const data = await res.json()  // typed as `any` — no safety
```

If you pass the wrong body shape or call a route that doesn't exist, TypeScript
catches it at compile time — not at runtime when a user hits the bug.

### The Middleware Chain

Before any route handler runs, Hono passes the request through a series of
**middleware functions**. Think of it like airport security checkpoints — every
request must pass through every checkpoint in order. If it fails one, it's turned
away before reaching its destination.

```
Request arrives at /api/wardrobe
        ↓
logger middleware      prints "GET /api/wardrobe" in your terminal
        ↓
getUser middleware     reads cookies → calls Kinde to verify → attaches user to request
                       if no valid session → returns 401 immediately, handler never runs
        ↓
zValidator middleware  validates the request body against the Zod schema (POST/PUT only)
                       if body is invalid → returns 400 immediately, handler never runs
        ↓
route handler          safe to run — user is verified, data is validated
```

The handler at the end only ever runs if every checkpoint above it passed. This is
why auth and validation middleware are so powerful — you write them once and they
protect every route automatically.

---

## Part 3: Validation at Every Layer

Data is validated **three times** as it travels from the user's browser to the database.
Each layer has a different job and catches different problems.

Think of it like a restaurant kitchen:

```
Customer (browser form)
    ↓  Waiter checks the order makes sense before writing it down  [Layer 1]
Order ticket (HTTP request)
    ↓  Kitchen manager checks the ticket before passing to the chef  [Layer 2]
Chef + Ingredients (database)
    ↓  Ingredients physically can't be combined wrong  [Layer 3]
```

### Layer 1 — Frontend Form Validation (as you type)

```
User types in the Name field
        ↓
TanStack Form onChange fires
        ↓
Zod runs: createItemSchema.shape.name  (z.string().min(1, '...'))
        ↓
name = ""        →  "Name must be at least 1 character long"  shown instantly
name = "T-Shirt" →  ✓  error cleared
```

**Purpose:** Instant feedback before any network request is made. Purely for user
experience — it would be frustrating to fill out a whole form, wait for a server
round-trip, and then find out a field was empty.

**Can it be bypassed?** Yes — anyone can open DevTools and send a raw request without
using your form. That's exactly why Layer 2 exists.

### Layer 2 — Backend Request Validation (when the request arrives)

```ts
wardrobeRoute.post(
  '/',
  getUser,
  zValidator('json', createItemSchema),  // ← middleware runs before handler
  async (c) => {
    const body = c.req.valid('json')  // guaranteed valid if we got here
    // ...
  }
)
```

`zValidator` runs before the handler. If the body doesn't match `createItemSchema`,
Hono returns a `400 Bad Request` and the handler never runs. The database is never touched.

```
POST /api/wardrobe  { name: "", type: "Top", size: "M", color: "White", imageUrl: "..." }
        ↓
zValidator: name fails z.string().min(1)
        ↓
400 Bad Request returned — handler and DB query never execute
```

**Purpose:** Defends against bad data from *any* source — not just your own frontend,
but bots, API clients, or someone testing your endpoints with curl. The server never
trusts input just because it arrived.

### Layer 3 — Database Constraints (when the row is written)

The Drizzle schema defines hard rules at the Postgres level:

```ts
imageUrl: text('image_url').notNull(),
userId:   text('user_id').notNull(),
```

If a bug in your backend code somehow tried to insert a row with a null `imageUrl`,
Postgres itself refuses it and throws an error. No code above it can override this.

**Purpose:** The database is the final guarantee. Even if your own backend code has
a bug that accidentally produces bad data, the DB schema enforces the rules at the
storage level. No row in the database can ever violate these constraints, regardless
of what code ran above.

### Why All Three Layers?

| Layer | Catches | Protects |
|---|---|---|
| Form (Zod + TanStack Form) | Empty fields, typos | The user — caught before any request fires |
| API (Hono zValidator) | Bad requests from any source | The server — no invalid data reaches handlers |
| Database (Postgres constraints) | Bugs in your own backend code | The data — a hard guarantee at storage level |

Removing any one of them means something can slip through. Together, they make it
nearly impossible for corrupt data to reach storage.

### The Shared Schema — One Definition, Three Places

All three layers use **the same Zod schema**, defined once in `server/sharedTypes.ts`
and imported by both the backend and the frontend:

```
server/db/schema/items.ts      Drizzle table + createInsertSchema()
        ↓
server/sharedTypes.ts          .omit({ userId, createdAt, id }) → createItemSchema
        ↓
        ├── server/routes/wardrobe.ts    zValidator('json', createItemSchema)  [Layer 2]
        │
        └── frontend/src/routes/        createItemSchema.shape.name  [Layer 1]
            create-item.tsx             (imported via @server alias)
```

The DB schema and validation schema are always in sync — you can't add a field to
one without it affecting the other.

---

## Flow 1: App Load & Authentication Check

When a user first opens the app:

```
1. Browser loads index.html → React app boots
        ↓
2. TanStack Router evaluates route: "/"
   → matched by /_authenticated layout
        ↓
3. _authenticated.tsx: beforeLoad hook fires
   → queryClient.ensureQueryData(userQueryOptions)
   → calls api.me.$get()
   [dev: Vite proxy forwards GET /api/me from :5173 → :8080]
        ↓
4. GET /api/me hits Hono backend
   → getUser middleware runs
   → reads cookies from request (id_token, access_token, etc.)
   → kindeClient.isAuthenticated(sessionManager) checks token validity
        ↓
5a. If NOT authenticated:
    → getUser returns 401
    → ensureQueryData throws
    → beforeLoad catches error → returns { user: null }
    → _authenticated component renders <Login /> (link to /api/login)

5b. If authenticated:
    → kindeClient.getUserProfile() returns { id, email, given_name, family_name }
    → /api/me handler returns user JSON
    → beforeLoad returns { user }
    → _authenticated component renders <Outlet />
    → home page (index.tsx) loads
```

---

## Flow 2: Loading the Wardrobe (Home Page)

Once the auth guard passes and the home page renders:

```
1. index.tsx mounts
   → useQuery(getAllItemsQueryOptions) called
   → useQuery(getTotalClothesQueryOptions) called
        ↓
2. TanStack Query cache check:
   → If ['get-all-items'] exists and is fresh (< 5 min): return cached data immediately
   → If stale or absent: fire GET /api/wardrobe
   [dev: Vite proxy forwards :5173 → :8080]
        ↓
3. GET /api/wardrobe → Hono backend
   → logger middleware: prints request to terminal
   → getUser middleware: validate cookies → get user.id
        ↓
4. Drizzle query:
   db.select().from(items)
     .where(eq(items.userId, user.id))   ← only this user's items
     .orderBy(desc(items.createdAt))     ← newest first
     .limit(100)
        ↓
5. Neon Postgres executes:
   SELECT * FROM items WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100
        ↓
6. Response: { items: [...] }
   → TanStack Query stores in cache under ['get-all-items']
   → Component re-renders with data
   → Item cards render with Framer Motion entrance animation
```

---

## Flow 3: Creating a New Item (Full Path)

This is the most complex flow — it touches every system: form validation, S3,
the API middleware chain, the database, and cache updates.

### Step 1 — User Fills Out the Form (Layer 1 Validation)

```
User types in the "Name" field
        ↓
TanStack Form field onChange fires
        ↓
zodValidator runs createItemSchema.shape.name (z.string().min(1, '...'))
        ↓
  If empty: field.state.meta.errors = ['Name must be at least 1 character long']
            → error displayed below input — no network request made
  If valid: errors cleared, field value updated in form state
```

### Step 2 — User Selects an Image

```
User clicks file input → selects a .jpg from their device
        ↓
onChange handler: URL.createObjectURL(file) → browser-local preview URL
→ img src set to preview URL → image previewed instantly (no upload yet)
→ file stored in component state for later upload
```

### Step 3 — User Submits the Form

```
User clicks "Add Item"
        ↓
form.handleSubmit() fires
        ↓
Full form validation runs against createItemSchema:
{
  name:     z.string().min(1)  ✓
  type:     z.string().min(1)  ✓
  size:     z.string().min(1)  ✓
  color:    z.string().min(1)  ✓
  imageUrl: z.string().url()   — will be set after S3 upload
}
        ↓
If any field fails: validation errors shown, submission stops here
If all pass: onSubmit({ value }) fires
```

### Step 4 — Optimistic Loading Skeleton

```
Before any async work starts:
        ↓
queryClient.setQueryData(['loading-create-item'], { item: formData })
        ↓
Home page's loadingCreateItemQueryOptions subscription triggers re-render
→ A skeleton card appears at the top of the grid
→ User sees immediate visual feedback that something is happening
```

### Step 5 — S3 Presigned URL

```
GET /api/signed-url  (Hono RPC)
[dev: Vite proxy forwards :5173 → :8080]
        ↓
Hono backend:
  → getUser middleware: verify auth
  → AWS SDK: PutObjectCommand presigned URL
     Bucket: stylify-local-minh
     Key: `${Date.now()}.jpg`
     Expires: 60 seconds
     ContentLengthRange: 0–10MB
  → returns { signedURL: 'https://s3.amazonaws.com/...' }
```

### Step 6 — Direct Browser-to-S3 Upload

```
fetch(signedURL, {
  method: 'PUT',
  body: imageFile,
  headers: { 'Content-Type': imageFile.type }
})
        ↓
Image uploaded directly from browser to S3
→ Backend is NOT in this request path (no proxy, goes straight to S3)
→ S3 URL: https://stylify-local-minh.s3.us-east-2.amazonaws.com/1234567890.jpg
```

### Step 7 — Create Item API Call (Layer 2 Validation)

```
api.wardrobe.$post({
  json: {
    name: 'White T-Shirt',
    type: 'Top',
    size: 'M',
    color: 'White',
    imageUrl: 'https://stylify-local-minh.s3...jpg'
  }
})
[dev: Vite proxy forwards :5173 → :8080]
        ↓
POST /api/wardrobe → Hono backend — middleware chain runs:
        ↓
  [1] logger          → prints request to terminal
        ↓
  [2] getUser         → reads cookies → verifies with Kinde → attaches user.id
                        if no valid session → 401 returned here, stops
        ↓
  [3] zValidator      → validates request body against createItemSchema
                        name: ✓  type: ✓  size: ✓  color: ✓  imageUrl: valid URL ✓
                        if any field fails → 400 returned here, stops
        ↓
  [4] handler runs    → all checks passed, safe to proceed
        ↓
Drizzle insert (Layer 3 — DB constraints enforced by Postgres):
  db.insert(items)
    .values({
      name: 'White T-Shirt',
      type: 'Top',
      size: 'M',
      color: 'White',
      imageUrl: 'https://...',
      userId: user.id   ← set server-side from the verified session, never from client
    })
    .returning()
        ↓
Neon Postgres executes:
  INSERT INTO items (name, type, size, color, image_url, user_id)
  VALUES ($1, $2, $3, $4, $5, $6)
  RETURNING *
        ↓
Returns: { id: 42, userId: 'kp_abc', name: 'White T-Shirt', ..., createdAt: '2024-...' }
        ↓
Backend responds: 200 { id: 42, ... }
```

### Step 8 — Cache Update & UI Refresh

```
onSubmit receives the new item from the API response
        ↓
Manual cache updates — no refetch needed, UI updates instantly:

queryClient.setQueryData(['get-all-items'], (old) => ({
  items: [newItem, ...old.items],   ← prepend new item to the list
}))

queryClient.setQueryData(['get-total-clothes'], (old) => ({
  total: old.total + 1,             ← increment count
}))

queryClient.setQueryData(['loading-create-item'], {})  ← clear skeleton
        ↓
All components subscribed to these query keys re-render:
→ Skeleton card replaced by the real item card (Framer Motion animation)
→ Total count increments in the header
→ Toast notification: "Item created successfully"
        ↓
Router navigates to "/" (home page)
```

---

## Flow 4: Delete an Item

```
User clicks Delete on an item card
        ↓
useMutation({ mutationFn: deleteItem }) fires
        ↓
DELETE /api/wardrobe/:id
[dev: Vite proxy forwards :5173 → :8080]
        ↓
Middleware chain:
  [1] logger   → logs request
  [2] getUser  → verify auth
        ↓
Handler:
  Drizzle delete:
    db.delete(items)
      .where(and(
        eq(items.id, id),
        eq(items.userId, user.id)   ← ownership check — can only delete your own items
      ))
      .returning()
  AWS SDK: DeleteObjectCommand → removes the image from S3
  Returns: deleted item
        ↓
onSuccess:
  queryClient.setQueryData(['get-all-items'], (old) => ({
    items: old.items.filter(i => i.id !== deletedId),
  }))
  queryClient.setQueryData(['get-total-clothes'], (old) => ({
    total: old.total - 1,
  }))
        ↓
Item card animates out (Framer Motion exit animation)
Total count decrements
```

---

## Flow 5: Logout

```
User clicks "Logout" on profile page
        ↓
Browser navigates to /api/logout
[dev: Vite proxy forwards :5173 → :8080]
        ↓
Hono backend: kindeClient.logout(c, sessionManager)
  → sessionManager.destroySession() deletes all auth cookies:
     id_token, access_token, user, refresh_token
  → redirects to Kinde logout URL
        ↓
Kinde invalidates the session server-side
  → redirects back to the app (KINDE_LOGOUT_REDIRECT_URI)
        ↓
App reloads → _authenticated.beforeLoad fires
  → GET /api/me → 401 (no cookies present)
  → user: null
  → <Login /> shown
```

---

## Summary: Who Does What

| Concern | Handled By |
|---|---|
| Dev proxy (CORS workaround) | Vite dev server (`vite.config.ts`) |
| Route protection | TanStack Router `beforeLoad` + `_authenticated` layout |
| Token storage & verification | Kinde SDK + httpOnly cookies (server-side only) |
| Form state & per-field validation | TanStack Form (Layer 1) |
| Shared validation schema | Zod `createItemSchema` in `server/sharedTypes.ts` |
| Request body validation | Hono `zValidator` middleware (Layer 2) |
| Data integrity guarantee | Postgres `NOT NULL` constraints via Drizzle schema (Layer 3) |
| Type-safe API calls | Hono RPC client (`hc<AppType>`) |
| Request caching & deduplication | TanStack Query (`queryClient`) |
| Optimistic UI updates | Manual `queryClient.setQueryData()` after mutations |
| Image storage | S3 via presigned URL (browser uploads directly, bypasses backend) |
| Data persistence | Drizzle ORM → Neon Postgres |
