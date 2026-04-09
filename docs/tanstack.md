# TanStack Query & TanStack Form

## Why TanStack Query?

### The problem it solves

Without a data-fetching library, you'd manage server state with `useEffect` + `useState`:

```tsx
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
```

This approach has real problems at scale:
- **No caching** — every component that needs items re-fetches independently
- **No deduplication** — if two components mount at the same time, two requests fire
- **No background revalidation** — stale data stays stale until component remounts
- **Manual loading/error state** — boilerplate in every component
- **No optimistic updates** — UI is always behind the server

**TanStack Query** (formerly React Query) solves all of this. It's a server state management library — not a general state manager like Redux, but specifically for data that lives on a server and needs to be fetched, cached, and kept fresh.

### What it gives you

- **Automatic caching** — fetch once, reuse everywhere. Multiple components using the same query key share one fetch.
- **Background refetching** — data is automatically refreshed when the window regains focus or the network reconnects.
- **Stale-while-revalidate** — show cached data instantly, then silently update in the background.
- **Built-in loading/error states** — `isLoading`, `isError`, `data` come for free.
- **Cache manipulation** — you can manually update the cache after a mutation so the UI reflects changes without a roundtrip.

---

## Setup (`src/main.tsx`)

```tsx
const queryClient = new QueryClient()

// QueryClientProvider makes the queryClient available to all components
// It's also passed into the TanStack Router context for use in beforeLoad/loaders
<QueryClientProvider client={queryClient}>
  <RouterProvider router={createRouter({ routeTree, context: { queryClient } })} />
</QueryClientProvider>
```

---

## Query Definitions (`src/lib/api.ts`)

All queries are defined as `queryOptions` objects. This pattern centralizes the query key and fetcher function, so the same query can be used in components, route loaders, and cache updates without duplication.

### User Query
```ts
export const userQueryOptions = queryOptions({
  queryKey: ['get-current-user'],
  queryFn: async () => {
    const res = await api.me.$get()
    if (!res.ok) throw new Error('Not authenticated')
    return res.json()
  },
  staleTime: Infinity,  // user data never goes stale — only changes on logout/login
})
```

### Items List Query
```ts
export const getAllItemsQueryOptions = queryOptions({
  queryKey: ['get-all-items'],
  queryFn: async () => {
    const res = await api.wardrobe.$get()
    return res.json()  // { items: Item[] }
  },
  staleTime: 1000 * 60 * 5,  // cached for 5 minutes
})
```

### Single Item Query (for edit page)
```ts
export const getItemQueryOptions = (id: number) => queryOptions({
  queryKey: ['get-item', id],  // id in the key means each item has its own cache slot
  queryFn: async () => {
    const res = await api.wardrobe[':id'].$get({ param: { id: String(id) } })
    return res.json()
  },
  staleTime: 1000 * 60 * 5,
})
```

### Total Count Query
```ts
export const getTotalClothesQueryOptions = queryOptions({
  queryKey: ['get-total-clothes'],
  queryFn: async () => {
    const res = await api.wardrobe['total-items'].$get()
    return res.json()  // { total: number }
  },
  staleTime: 1000 * 60 * 5,
})
```

### Optimistic Loading Queries

These are a clever trick for showing a loading skeleton while a create/edit is in progress:

```ts
// No actual queryFn — this is just a slot in the cache used to pass form data
// between the form submit handler and the home page component
export const loadingCreateItemQueryOptions = queryOptions<{ item?: createItem }>({
  queryKey: ['loading-create-item'],
  queryFn: async () => ({ item: undefined }),
  staleTime: Infinity,
})
```

When a create starts: `queryClient.setQueryData(['loading-create-item'], { item: formData })`
The home page reads this and renders a skeleton card.
When the create finishes: `queryClient.setQueryData(['loading-create-item'], {})`
The skeleton disappears and the real item appears.

---

## Using Queries in Components

```tsx
// In the home page component
const { data, isPending, error } = useQuery(getAllItemsQueryOptions)

if (isPending) return <Skeleton />
if (error) return <p>Error loading items</p>

return data.items.map(item => <ItemCard key={item.id} item={item} />)
```

---

## Cache Updates After Mutations

Instead of refetching after a create/delete/update, the app manually updates the cache. This makes the UI feel instant.

### Delete (uses `useMutation`)
```tsx
const { mutate: deleteItem } = useMutation({
  mutationFn: async (id: number) => {
    const res = await api.wardrobe[':id'].$delete({ param: { id: String(id) } })
    return res.json()
  },
  onSuccess: (_, deletedId) => {
    // Remove the item from the items list cache
    queryClient.setQueryData(getAllItemsQueryOptions.queryKey, (old) => ({
      items: old!.items.filter(item => item.id !== deletedId),
    }))
    // Decrement the total count
    queryClient.setQueryData(getTotalClothesQueryOptions.queryKey, (old) => ({
      total: old!.total - 1,
    }))
  },
  onError: () => toast.error('Failed to delete item'),
})
```

### Create (manual, inside `onSubmit`)
```ts
// After successful API call:
queryClient.setQueryData(getAllItemsQueryOptions.queryKey, (old) => ({
  items: [newItem, ...(old?.items ?? [])],
}))
queryClient.setQueryData(getTotalClothesQueryOptions.queryKey, (old) => ({
  total: (old?.total ?? 0) + 1,
}))
queryClient.setQueryData(loadingCreateItemQueryOptions.queryKey, {})  // clear skeleton
```

---

## TanStack Form

**[TanStack Form](https://tanstack.com/form)** handles form state and validation. It's used on the Create and Edit pages.

### Why TanStack Form?

- Integrates with Zod schemas via `@tanstack/zod-form-adapter` — you reuse the same schema already defined for backend validation.
- Fine-grained field-level reactivity — only the field that changed re-renders, not the whole form.
- Typed field names — passing a wrong field name is a TypeScript error.

### Usage Pattern

```tsx
import { useForm } from '@tanstack/react-form'
import { zodValidator } from '@tanstack/zod-form-adapter'
import { createItemSchema } from '@server/sharedTypes'

const form = useForm({
  defaultValues: { name: '', type: '', size: '', color: '', imageUrl: '' },
  onSubmit: async ({ value }) => {
    // value is typed as createItem (inferred from Zod schema)
    await createItem(value)
  },
})

// In JSX:
<form.Field
  name="name"
  validators={{ onChange: createItemSchema.shape.name }}  // per-field Zod validation
>
  {(field) => (
    <>
      <Input
        value={field.state.value}
        onChange={(e) => field.handleChange(e.target.value)}
      />
      {field.state.meta.errors && (
        <p className="text-red-500">{field.state.meta.errors.join(', ')}</p>
      )}
    </>
  )}
</form.Field>
```

The `validators: { onChange: createItemSchema.shape.name }` line connects the individual field's Zod sub-schema to the form field. Validation runs as the user types, and errors appear below the input.
