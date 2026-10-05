# Zod Schemas — Validation Layer

## What is Zod?

**[Zod](https://zod.dev)** is a TypeScript-first schema declaration and validation library. You define the shape of your data once as a Zod schema, and Zod:

1. **Validates** data at runtime (checking types, constraints, formats)
2. **Infers** TypeScript types from the schema, so you get static typing for free

```ts
import { z } from 'zod'

const schema = z.object({
  name: z.string().min(1),
  size: z.string(),
})

type Item = z.infer<typeof schema>
// TypeScript sees: { name: string; size: string }

schema.parse({ name: '', size: 'M' })
// throws ZodError: "String must contain at least 1 character(s)"

schema.parse({ name: 'T-Shirt', size: 'M' })
// returns { name: 'T-Shirt', size: 'M' } — typed and validated
```

---

## Why Use Zod in This App?

The app has three layers where data is validated:

| Layer | Without Zod | With Zod |
|---|---|---|
| Frontend form | Any string accepted, errors only appear on server | Validation as the user types, descriptive messages |
| Backend API | You'd manually check `if (!body.name) return 400` | One-line middleware validates the whole request body |
| Database insert | DB might reject bad data with a cryptic Postgres error | Schema validated before it ever reaches the DB |

Zod also solves a **"two truths" problem**: without it, you'd define the TypeScript type in one place and write validation logic separately — and they can drift out of sync. With Zod, the schema IS the type. You define it once and both flow from it.

---

## Schema Definition

The client-facing schema, `createItemSchema`, is defined once in the shared package (shown in the next section). The server's insert schema, `insertItemsSchema`, is derived from it by adding `userId`, so the validation rules live in one place.

**`server/db/schema/items.ts`:**
```ts
import { z } from 'zod'
import { createItemSchema } from '@stylify/shared'
import { pgTable, serial, text, varchar, timestamp, index } from 'drizzle-orm/pg-core'

// 1. Drizzle table definition (used to generate SQL + query types)
export const items = pgTable('items', {
  id:        serial('id').primaryKey(),
  userId:    text('user_id').notNull(),
  name:      varchar('name', { length: 256 }),
  size:      varchar('size', { length: 256 }),
  type:      varchar('type', { length: 256 }),
  color:     varchar('color', { length: 256 }),
  createdAt: timestamp('created_at').defaultNow(),
  lastWornAt: timestamp('last_worn_at'),
  imageUrl:  text('image_url').notNull(),
}, (items) => ({
  userIdIndex: index('name_idx').on(items.userId),
}))

// 2. Server-side insert schema = client contract + userId injected by the route
export const insertItemsSchema = createItemSchema.extend({
  userId: z.string().min(1),
})
```

`.extend({ userId })` adds the one field the client must not send. The route fills it in from the auth session, so the shared schema never changes when the table does.

---

## Sharing the Schema Between Backend and Frontend

**`shared/src/index.ts`:**
```ts
import { z } from 'zod'

export const createItemSchema = z.object({
  name: z.string().min(1, 'Name must be at least 1 character long'),
  type: z.string().min(1, 'Type must be at least 1 character long'),
  size: z.string().min(1, 'Size must be at least 1 character long'),
  color: z.string().min(1, 'Color must be at least 1 character long'),
  imageUrl: z.string().url('Image URL must be a valid URL'),
})

// Infer the TypeScript type from the schema
export type createItem = z.infer<typeof createItemSchema>
// Result: { name: string; type: string; size: string; color: string; imageUrl: string }
```

Both the server and the frontend import it from the `@stylify/shared` workspace package:

```ts
// frontend/src/routes/_authenticated/create-item.tsx
import { createItemSchema } from '@stylify/shared'
import type { createItem } from '@stylify/shared'
```

This is the key architectural decision: **one schema, used in three places:**
1. Backend middleware validation (Hono + `@hono/zod-validator`)
2. Frontend form field validation (TanStack Form + `@tanstack/zod-form-adapter`)
3. TypeScript types (via `z.infer<>`) — both frontend and backend

---

## How Validation Works End-to-End

### Backend — Request Validation Middleware

```ts
// server/routes/wardrobe.ts
wardrobeRoute.post(
  '/',
  getUser,
  zValidator('json', createItemSchema),  // Hono middleware: validates req body
  async (c) => {
    const body = c.req.valid('json')  // typed as createItem — guaranteed valid here
    // If we got here, body.name, body.type, etc. all passed Zod validation
    const result = await db.insert(items).values({ ...body, userId: user.id }).returning()
    return c.json(result[0])
  }
)
```

If the request body doesn't match `createItemSchema`, `zValidator` automatically returns a `400 Bad Request` with details about what failed — before the handler even runs.

### Frontend — Form Field Validation

```tsx
// Each field is connected to its own Zod sub-schema
<form.Field
  name="name"
  validators={{
    onChange: createItemSchema.shape.name,  // z.string().min(1, 'Name must be...')
  }}
>
  {(field) => (
    <div>
      <Input
        value={field.state.value}
        onChange={(e) => field.handleChange(e.target.value)}
        onBlur={field.handleBlur}
      />
      {field.state.meta.errors.length > 0 && (
        <em className="text-red-500">{field.state.meta.errors.join(', ')}</em>
      )}
    </div>
  )}
</form.Field>
```

`createItemSchema.shape.name` extracts just the `name` field's Zod validator (`z.string().min(1, ...)`). TanStack Form runs this whenever the field changes and surfaces any errors in `field.state.meta.errors`.

---

## Validation Fields & Rules

| Field | Rule | Error Message |
|---|---|---|
| `name` | `z.string().min(1)` | "Name must be at least 1 character long" |
| `type` | `z.string().min(1)` | "Type must be at least 1 character long" |
| `size` | `z.string().min(1)` | "Size must be at least 1 character long" |
| `color` | `z.string().min(1)` | "Color must be at least 1 character long" |
| `imageUrl` | `z.string().url()` | "Image URL must be a valid URL" |
