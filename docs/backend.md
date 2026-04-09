# Backend — Hono + Bun

## Framework & Runtime

The backend is built with **[Hono](https://hono.dev)** running on **[Bun](https://bun.sh)**.

- **Bun** is a JavaScript runtime (like Node.js) but significantly faster. It has a built-in bundler, test runner, and package manager. The server starts with `Bun.serve()` in `server/index.ts`.
- **Hono** is a lightweight, edge-ready web framework. Think of it like Express, but designed from the ground up for TypeScript and with built-in support for things like middleware chaining, typed contexts, and RPC client generation.

**Entry point:** `server/index.ts` → imports the app from `server/app.ts` and hands it to `Bun.serve()`.

**App setup** (`server/app.ts`):
```ts
const app = new Hono()
app.use('*', logger())           // log all requests
app.route('/api', authRoutes)    // /api/login, /logout, /me, etc.
app.route('/api', wardrobeRoutes)
app.route('/api', signedUrlRoutes)
app.get('*', serveStatic(...))   // serves the React frontend build
```

The backend serves the **compiled frontend static files** as well, so there's only one server process in production. The Vite dev server is only used during frontend development.

---

## API Routes

All routes are prefixed with `/api`.

### Auth Routes (`server/routes/auth.ts`)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/login` | Redirects browser to Kinde's login page |
| `GET` | `/api/register` | Redirects browser to Kinde's register page |
| `GET` | `/api/callback` | Kinde redirects here after login; sets session cookies |
| `GET` | `/api/logout` | Clears session cookies, redirects to Kinde logout |
| `GET` | `/api/me` | Returns the currently authenticated user's profile |

### Wardrobe Routes (`server/routes/wardrobe.ts`)

All wardrobe routes require authentication via the `getUser` middleware.

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/wardrobe` | Get all items for the current user (max 100, newest first) |
| `POST` | `/api/wardrobe` | Create a new clothing item |
| `GET` | `/api/wardrobe/total-items` | Get total item count for the current user |
| `GET` | `/api/wardrobe/:id` | Get a single item by ID |
| `PUT` | `/api/wardrobe/:id` | Update an existing item |
| `DELETE` | `/api/wardrobe/:id` | Delete an item and its S3 image |

### Signed URL Route (`server/routes/signedUrl.ts`)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/signed-url` | Generate a presigned S3 URL for a direct browser upload |

---

## Authentication — Kinde

Authentication is handled entirely on the backend using **[Kinde](https://kinde.com)** via the `@kinde-oss/kinde-typescript-sdk`.

**Config** (`server/kinde.ts`):
```ts
const kindeClient = createKindeServerClient(GrantType.AUTHORIZATION_CODE, {
  authDomain: process.env.KINDE_DOMAIN,       // https://virtualwardrobe.kinde.com
  clientId: process.env.KINDE_CLIENT_ID,
  clientSecret: process.env.KINDE_CLIENT_SECRET,
  redirectURL: process.env.KINDE_REDIRECT_URI,      // /api/callback
  logoutRedirectURL: process.env.KINDE_LOGOUT_REDIRECT_URI,
})
```

### Session Management

Kinde needs a place to store session tokens between requests. A custom `sessionManager` is implemented that reads/writes **httpOnly cookies**:

```ts
const sessionManager = (c: Context) => ({
  getSessionItem: (key: string) => getCookie(c, key),
  setSessionItem: (key: string, value: unknown) =>
    setCookie(c, key, typeof value === 'string' ? value : JSON.stringify(value)),
  removeSessionItem: (key: string) => deleteCookie(c, key),
  destroySession: () => ['id_token', 'access_token', 'user', 'refresh_token']
    .forEach(key => deleteCookie(c, key)),
})
```

Using `httpOnly` cookies means the tokens are **never accessible to JavaScript on the frontend** — they're sent automatically by the browser on every request, which is the secure way to handle auth tokens in a traditional web app.

### `getUser` Middleware

This is the auth guard used on every protected route:

```ts
export const getUser = async (c: Context, next: Next) => {
  const manager = sessionManager(c)
  const isAuthenticated = await kindeClient.isAuthenticated(manager)
  if (!isAuthenticated) return c.json({ error: 'Unauthorized' }, 401)
  const user = await kindeClient.getUserProfile(manager)
  c.set('user', user)  // available downstream as c.var.user
  await next()
}
```

Usage in routes:
```ts
// The getUser middleware runs before the handler
wardrobeRoute.get('/', getUser, async (c) => {
  const user = c.var.user  // typed UserType from Kinde SDK
  // ...query DB for this user's items
})
```

### Full Auth Flow

```
1. User clicks "Login"
      ↓
2. Browser → GET /api/login
      ↓
3. Backend calls kindeClient.login() → 302 redirect to Kinde login page
      ↓
4. User logs in on Kinde's hosted page
      ↓
5. Kinde → 302 redirect to GET /api/callback?code=...
      ↓
6. Backend calls kindeClient.handleRedirectToApp()
   → exchanges code for tokens
   → stores tokens in httpOnly cookies
   → 302 redirect to frontend "/"
      ↓
7. Subsequent requests automatically include cookies
   → getUser middleware validates them on every protected route
      ↓
8. GET /api/logout → destroySession() clears cookies → redirect to Kinde logout
```

---

## S3 Image Storage

Clothing item images are stored in **AWS S3** (`stylify-local-minh` bucket, `us-east-2`).

Rather than uploading through the backend (which would be slow and memory-intensive), the app uses **presigned URLs**:

1. Frontend requests a signed URL: `GET /api/signed-url`
2. Backend generates a time-limited (60s) PUT URL directly to S3
3. Frontend uploads the image directly to S3 — the backend is never in the path
4. Frontend uses the resulting S3 URL as `imageUrl` in the item payload

When an item is deleted, the backend extracts the S3 key from the stored URL and calls `DeleteObjectCommand` to clean up the file.

---

## Environment Variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Neon Postgres connection string |
| `KINDE_DOMAIN` | Your Kinde tenant domain |
| `KINDE_CLIENT_ID` | Kinde app client ID |
| `KINDE_CLIENT_SECRET` | Kinde app client secret |
| `KINDE_REDIRECT_URI` | OAuth callback URL (`/api/callback`) |
| `KINDE_LOGOUT_REDIRECT_URI` | Post-logout redirect URL |
| `AWS_ACCESS_KEY_ID` | AWS credentials for S3 |
| `AWS_SECRET_ACCESS_KEY` | AWS credentials for S3 |
