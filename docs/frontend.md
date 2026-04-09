# Frontend — React + Vite + TanStack Router

## Setup

The frontend is a standard **React 18** + **Vite** SPA located in the `frontend/` directory. During development, Vite's dev server proxies `/api` requests to the Hono backend. In production, the frontend is built (`bun run build`) and the backend serves the static output directly.

---

## Routing — TanStack Router (File-Based)

**[TanStack Router](https://tanstack.com/router)** is used for client-side routing. Unlike React Router, TanStack Router is fully type-safe — every route's params, search params, and context are statically typed.

This project uses **file-based routing**: the folder/file structure under `src/routes/` defines the URL structure automatically. A Vite plugin watches the routes directory and auto-generates `src/routeTree.gen.ts`.

### Route Tree

```
src/routes/
├── __root.tsx                    → layout wrapper for entire app (NavBar, Toaster)
├── about.tsx                     → /about  (public)
├── _authenticated.tsx            → auth guard layout (no URL segment)
└── _authenticated/
    ├── index.tsx                 → /  (home, wardrobe grid)
    ├── create-item.tsx           → /create-item
    ├── edit-item.$id.tsx         → /edit-item/:id  ($id = dynamic segment)
    └── profile.tsx               → /profile
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
    if (!user) return <Login />   // shows "Login" button linking to /api/login
    return <Outlet />             // renders the matched child route
  },
})
```

If the `/api/me` call fails (user not authenticated), the user sees the login screen instead of the route content. No redirect needed — the guard renders inline.

---

## Root Layout — `__root.tsx`

Renders the **NavBar** and wraps everything in the `<Outlet />` for child routes. Also renders the `<Toaster />` for toast notifications (from Sonner).

**NavBar** is responsive:
- **Desktop**: horizontal links (Home, About, Create, Profile)
- **Mobile**: hamburger menu icon that opens a **Sheet** (Radix UI slide-in drawer) with the same links

---

## Pages & Components

### Home (`_authenticated/index.tsx`)

The wardrobe grid. Displays all clothing items in a responsive card grid (1 column on mobile → 4 columns on XL screens).

Key behaviors:
- Fetches items via `getAllItemsQueryOptions` and total count via `getTotalClothesQueryOptions`
- While a **create** mutation is in progress, a loading skeleton card appears at the top of the grid (via `loadingCreateItemQueryOptions`)
- Each card shows: image, name, color/type/size badges
- Edit button → navigates to `/edit-item/:id`
- Delete button → calls `deleteItem()` mutation, updates cache immediately (optimistic update)
- Item cards animate in/out with **Framer Motion**

### Create Item (`_authenticated/create-item.tsx`)

A form with fields: Name, Type, Size, Color, Image.

Image upload flow:
1. User selects a file → browser preview shown via `URL.createObjectURL(file)`
2. On submit: fetch a presigned S3 URL from `GET /api/signed-url`
3. PUT the file directly to S3 using the signed URL
4. Use the resulting S3 URL as `imageUrl` in the POST to `/api/wardrobe`

After success: prepends the new item to the cached items list and increments the total count, so the home page updates without a refetch.

### Edit Item (`_authenticated/edit-item.$id.tsx`)

Same form as create, pre-populated with the existing item's data. Fetches the item via `getItemQueryOptions(id)`. On submit, if no new image was chosen, the existing `imageUrl` is preserved.

After success: replaces the item in the cached items list.

### Profile (`_authenticated/profile.tsx`)

Shows the current user's avatar (initials), name, and email from `userQueryOptions`. Has a **Logout** button that navigates to `/api/logout` (backend clears cookies and redirects to Kinde).

---

## UI Components (`src/components/ui/`)

All UI components are thin wrappers around **Radix UI** primitives styled with **Tailwind CSS**. This is the [shadcn/ui](https://ui.shadcn.com) pattern.

| Component | Based On | Used For |
|---|---|---|
| `Button` | Radix Slot + CVA | All buttons (variants: default, destructive, outline, ghost, link) |
| `Card` | `div` | Item cards on the home page |
| `Input` | `input` | Form text inputs |
| `Label` | Radix Label | Form field labels |
| `Badge` | `div` + CVA | Color/type/size tags on item cards |
| `Skeleton` | `div` | Loading placeholder shapes |
| `Avatar` | Radix Avatar | Profile picture / initials display |
| `Sheet` | Radix Dialog | Mobile navigation drawer |
| `Sonner` | Sonner | Toast notification container |

**CVA** (Class Variance Authority) is used for components with multiple style variants (Button, Badge) — it generates the correct Tailwind class string based on the `variant` prop.
