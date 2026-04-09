# Full Data Flow — End to End

This document traces the complete lifecycle of a request through the app, using **creating a new clothing item** as the primary example, since it involves every system: auth, form validation, S3 upload, API call, DB write, and cache update.

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
   → calls api.me.$get()   ← Hono RPC
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
2. Cache check:
   → If ['get-all-items'] exists and is fresh (< 5 min): return cached data immediately
   → If stale or absent: fire GET /api/wardrobe
        ↓
3. GET /api/wardrobe → Hono backend
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

This is the most complex flow — it touches form validation, S3, the API, and cache updates.

### Step 1 — User Fills Out the Form

```
User types in the "Name" field
        ↓
TanStack Form field onChange fires
        ↓
zodValidator runs createItemSchema.shape.name (z.string().min(1, '...'))
        ↓
  If empty: field.state.meta.errors = ['Name must be at least 1 character long']
            → error displayed below input
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
→ Backend is NOT in this request path
→ S3 URL is now: https://stylify-local-minh.s3.us-east-2.amazonaws.com/1234567890.jpg
```

### Step 7 — Create Item API Call

```
api.wardrobe.$post({
  json: {
    name: 'White T-Shirt',
    type: 'Top',
    size: 'M',
    color: 'White',
    imageUrl: 'https://stylify-local-minh.s3...jpg'  ← the S3 URL
  }
})
        ↓
POST /api/wardrobe → Hono backend
        ↓
Middleware chain:
  1. getUser → verify cookies → extract user.id
  2. zValidator('json', createItemSchema) → validate request body
     → name: ✓  type: ✓  size: ✓  color: ✓  imageUrl: valid URL ✓
     → if fails: 400 returned, handler never runs
  3. Handler executes
        ↓
Drizzle insert:
  db.insert(items)
    .values({
      name: 'White T-Shirt',
      type: 'Top',
      size: 'M',
      color: 'White',
      imageUrl: 'https://...',
      userId: user.id   ← injected server-side, not from client
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
onSubmit receives the new item from the API
        ↓
Manual cache updates (no refetch needed):

queryClient.setQueryData(['get-all-items'], (old) => ({
  items: [newItem, ...old.items],   ← prepend new item
}))

queryClient.setQueryData(['get-total-clothes'], (old) => ({
  total: old.total + 1,             ← increment count
}))

queryClient.setQueryData(['loading-create-item'], {})  ← clear skeleton
        ↓
All components subscribed to these query keys re-render:
→ Skeleton card is replaced by the new item card (with Framer Motion animation)
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
DELETE /api/wardrobe/:id → Hono backend
  → getUser: verify auth
  → Drizzle:
      db.delete(items)
        .where(and(
          eq(items.id, id),
          eq(items.userId, user.id)   ← ownership check
        ))
        .returning()
  → AWS SDK: DeleteObjectCommand to remove the S3 image
  → returns deleted item
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
        ↓
Hono backend: kindeClient.logout(c, sessionManager)
  → sessionManager.destroySession() deletes cookies:
     id_token, access_token, user, refresh_token
  → redirects to Kinde logout URL
        ↓
Kinde invalidates the session on their end
  → redirects to http://localhost:5173 (KINDE_LOGOUT_REDIRECT_URI)
        ↓
App reloads → _authenticated.beforeLoad fires
  → GET /api/me → 401 (no cookies)
  → user: null
  → <Login /> shown
```

---

## Summary: Who Does What

| Concern | Handled By |
|---|---|
| Route protection | TanStack Router `beforeLoad` + `_authenticated` layout |
| Token storage & verification | Kinde SDK + httpOnly cookies (server-side only) |
| Form state & per-field validation | TanStack Form |
| Input schema validation (frontend) | Zod (`createItemSchema.shape.*`) |
| Request body validation (backend) | Hono `zValidator` middleware |
| Type-safe API calls | Hono RPC client (`hc<AppType>`) |
| Image storage | S3 via presigned URL (browser uploads directly) |
| Data persistence | Drizzle ORM → Neon Postgres |
| Client-side cache | TanStack Query (`queryClient`) |
| Optimistic UI | Manual `queryClient.setQueryData()` after mutations |
