# Frontend — React + Vite + TanStack Router

## Setup

The frontend is a **React 19** + **Vite** SPA in `frontend/`. During development, Vite's dev server proxies `/api` requests to the Hono backend. In production, the built output is served from S3 behind CloudFront (see `docs/cloud-architecture.md`).

---

## Routing — TanStack Router (File-Based)

**[TanStack Router](https://tanstack.com/router)** is used for client-side routing. Unlike React Router, TanStack Router is fully type-safe — every route's params, search params, and context are statically typed.

This project uses **file-based routing**: the folder/file structure under `src/routes/` defines the URL structure automatically. A Vite plugin watches the routes directory and auto-generates `src/routeTree.gen.ts`.

### Route Tree

```
src/routes/
├── __root.tsx                    → layout wrapper for entire app (Toaster)
├── _authenticated.tsx            → auth guard layout (no URL segment); signed out shows the landing page
└── _authenticated/
    ├── index.tsx                 → /  (closet grid)
    ├── create-item.tsx           → /create-item
    ├── edit-item.$id.tsx         → /edit-item/:id  ($id = dynamic segment)
    └── profile.tsx               → /profile  (shown as "Me")
```

**Naming conventions:**
- `__root.tsx` — the root layout, wraps all routes
- `_authenticated` — underscore prefix means it's a **pathless layout route** (no URL segment added, just wraps children)
- `$id` — dollar sign prefix denotes a **dynamic route parameter**

### Router Bootstrap (`src/main.tsx`)

```tsx
const queryClient = new QueryClient()

const router = createRouter({
  routeTree,
  context: { queryClient },  // queryClient is injected into every route's context
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}>
    <RouterProvider router={router} />
  </QueryClientProvider>
)
```

The `queryClient` is passed into the router context so that routes can use it in `beforeLoad` and `loader` hooks (e.g., to prefetch data before rendering).

---

## Auth Guard — `_authenticated.tsx`

This is the most important routing concept in the app. The `_authenticated` layout route wraps all protected pages. Its `beforeLoad` hook runs before any child route renders:

```tsx
export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async ({ context: { queryClient } }) => {
    try {
      const user = await queryClient.ensureQueryData(userQueryOptions)
      return { user }
    } catch {
      return { user: null }
    }
  },
  component: function AuthGuard() {
    const { user } = Route.useRouteContext()
    if (!user) return <Landing />                 // signed out: the landing page
    return <><AppHeader /><Outlet /></>           // signed in: header, then the matched child route
  },
})
```

If the `/api/me` call fails (user not authenticated), the user sees the landing page instead of the route content, at whatever URL they opened. No redirect needed — the guard renders inline. The landing page's "Sign in" (header) and "I already have an account" links go to `/api/login`, and "Get started" goes to `/api/register`; they are plain `<a>` tags because sign-in is a server redirect.

---

## Root Layout — `__root.tsx`

Renders the `<Outlet />` and the `<Toaster />` (Sonner). The header is not here: `_authenticated.tsx` renders `AppHeader` only for signed-in users, so the landing page has its own.

---

## Look and feel

Warm cream background, ink text, coral accent, rounded "chunky" buttons with a hard bottom edge, Nunito (`@fontsource/nunito`, weights 700 to 900). The colours and the ten type colours (`top`, `outerwear`, `trousers`, `shorts`, `skirt`, `dress`, `shoes`, `hat`, `bag`, `other`) live in `shared/src/brand/tokens.json`, read by `frontend/tailwind.config.js` and `mobile/tailwind.config.js`, so both apps use the same values. `shared/src/brand/index.ts` (imported as `@stylify/shared/brand`) also holds the type helpers: `typeKey` maps a free-text `type` ("jeans", "Hoodie") to one of the keys, `groupByType` counts items per key, and `resolveFilter` falls back to "all" when the selected filter has no items. `garments.ts` has the silhouette paths for the ten types and the hanger.

## Pages & Components

### Landing (`components/landing/`)

Shown at any URL when signed out. `Landing.tsx` is the hero, three feature cards and the footer; `Walkthrough.tsx` is a looping four-scene animation (take a photo, thinking, the guess, it lands in the closet) built from the real `TypeChip` and `ChunkyButton`. It advances every 2.5 s, pauses while the tab is hidden, and drops the bounce and scale effects (opacity changes stay) when the visitor prefers reduced motion. There is no demo wardrobe: the walkthrough stands in for one.

### Header (`components/app/AppHeader.tsx`)

Logo, Closet, a coral Add button and Me. The same row on phones and desktop; there is no hamburger menu or drawer.

### Closet (`_authenticated/index.tsx`)

The grid of `ItemTile`s, with a row of `Pill` filters ("All" and one per type that has items). Tiles are tinted by type and show a `Garment` silhouette when an item has no photo. Items come from `getAllItemsQueryOptions`. While a create mutation is running, a skeleton tile (`ItemTileSkeleton`) appears first (`loadingCreateItemQueryOptions`). With no items it shows `EmptyCloset`; a failed load shows `ErrorPanel`. Tiles animate in with Framer Motion.

### Add and Edit (`create-item.tsx`, `edit-item.$id.tsx`)

Both use `components/app/ItemForm.tsx`: `Field`s for name, size and colour, `TypeChip`s for the type, and `PhotoPicker`. Edit adds a delete button.

Image upload flow:
1. User selects a file → browser preview shown via `URL.createObjectURL(file)`
2. On submit: fetch a presigned S3 URL from `GET /api/signed-url`
3. PUT the file directly to S3 using the signed URL
4. Use the resulting S3 URL as `imageUrl` in the POST to `/api/wardrobe`

After a create the new item is prepended to the cached list and the total count incremented; after an edit the item is replaced in the cached list. If no new image was chosen on edit, the existing `imageUrl` is kept.

If the item was deleted (here or on the phone), `GET`/`PUT /api/wardrobe/:id` answer 404 and `getItem`/`editItem` throw `ItemNotFoundError`. The page then shows "This item no longer exists" with a button back to the closet, and the items list and count are refetched. A 404 is not retried (`retryUnlessNotFound`); any other load failure shows "Could not load this item" with "Try again". `frontend/src/lib/api.test.ts` covers the client side (`bun test ./frontend`).

### Me (`_authenticated/profile.tsx`)

Avatar initials, name, email and the closet counts per type (from `userQueryOptions` and `getAllItemsQueryOptions`), and a **Sign out** link to `/api/logout` (backend clears cookies and redirects to Kinde).

### Removed

The About page and the Outfit Suggestions page are gone, and `/about` and `/outfit-suggestions` no longer exist. `GET /api/recommendations` is kept on the server for a later screen.

---

## Components

- `components/app/`: the app's own primitives: `AppHeader`, `ChunkyButton` (and `chunkyClasses` for links styled as buttons), `Pill`, `TypeChip`, `Field`, `ItemForm`, `ItemTile`, `PhotoPicker`, `EmptyCloset`, `ErrorPanel`.
- `components/brand/`: `Logo` (coral hanger plus the word) and `Garment` (SVG silhouette by type, `fill="currentColor"`).
- `components/landing/`: `Landing`, `Walkthrough`.
- `components/ui/sonner.tsx`: the toast container, the only shadcn component left. Radix, CVA and the other shadcn wrappers were removed with the restyle.
