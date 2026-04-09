# Database — Neon + Drizzle ORM

## What is Neon?

**[Neon](https://neon.tech)** is a serverless PostgreSQL provider. It's the same Postgres you know, but:

- No always-on server to manage — it scales to zero when idle and spins up on demand
- Accessed over a standard Postgres connection string (via the `postgres` npm package)
- Free tier is generous for side projects

The connection string lives in `.env` as `DATABASE_URL` and looks like:
```
postgresql://neondb_owner:****@ep-billowing-lake-a5bjvc14-pooler.us-east-2.aws.neon.tech/neondb
```

The `-pooler` subdomain in the URL means it's using **connection pooling** (PgBouncer under the hood), which is important for serverless environments where many short-lived connections would otherwise exhaust Postgres's connection limit.

---

## What is Drizzle ORM?

**[Drizzle ORM](https://orm.drizzle.team)** is a TypeScript-first ORM (Object-Relational Mapper). Its job is to let you write database queries in TypeScript instead of raw SQL, with full type inference.

**Why Drizzle over alternatives like Prisma?**
- Drizzle generates **no runtime abstraction layer** — queries compile down to SQL and run directly. This makes it fast and predictable.
- The schema is written in TypeScript (not a separate `.prisma` file), so it lives alongside your code.
- It has a companion tool, **Drizzle Kit**, for generating and running SQL migrations.
- It integrates with **drizzle-zod** to auto-generate Zod validation schemas directly from your table definitions — so your DB shape and your validation shape are always in sync.

**Connection setup** (`server/db/index.ts`):
```ts
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

const client = postgres(process.env.DATABASE_URL!)
export const db = drizzle(client)
```

`db` is the object you import in route handlers to run queries.

---

## Schema

The entire database is a single table: **`items`**.

**Definition** (`server/db/schema/items.ts`):
```ts
export const items = pgTable('items', {
  id:        serial('id').primaryKey(),
  userId:    text('user_id').notNull(),
  name:      varchar('name', { length: 256 }),
  size:      varchar('size', { length: 256 }),
  type:      varchar('type', { length: 256 }),
  color:     varchar('color', { length: 256 }),
  createdAt: timestamp('created_at').defaultNow(),
  imageUrl:  text('image_url').notNull(),
}, (table) => ({
  nameIdx: index('name_idx').on(table.userId),
}))
```

### Column Breakdown

| Column | SQL Type | Notes |
|---|---|---|
| `id` | `SERIAL PRIMARY KEY` | Auto-incrementing integer, unique per item |
| `userId` | `TEXT NOT NULL` | The Kinde user ID string (e.g. `kp_abc123`) — ties items to a user |
| `name` | `VARCHAR(256)` | Display name of the item |
| `size` | `VARCHAR(256)` | e.g. S, M, L, XL |
| `type` | `VARCHAR(256)` | e.g. Shirt, Pants, Shoes |
| `color` | `VARCHAR(256)` | e.g. Red, Navy Blue |
| `createdAt` | `TIMESTAMP` | Auto-set to `now()` on insert |
| `imageUrl` | `TEXT NOT NULL` | Full S3 URL of the uploaded image |

### Index

An index named `name_idx` is placed on `userId`. This means that when the app queries `WHERE user_id = ?` (which happens on every request), Postgres doesn't have to scan the whole table — it jumps straight to the matching rows. Without this index, the query would get slower as the table grows.

---

## Migrations

Drizzle Kit manages schema migrations. Migration files live in `drizzle/` (SQL) and are tracked by Drizzle's metadata.

**Migration history:**

| File | Change |
|---|---|
| `0000_yummy_arachne.sql` | Initial schema: `id`, `user_id`, `name`, `size`, `type`, `color` |
| `0001_dapper_hulk.sql` | Added `created_at` column |
| `0002_dry_white_tiger.sql` | Added `image_url` column |

**Running migrations:**
```bash
bun run migrate   # runs migrate.ts which calls drizzle-kit migrate
```

`drizzle.config.ts` tells Drizzle Kit where the schema is and where to put migration files:
```ts
export default defineConfig({
  schema: './server/db/schema/items.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL! },
})
```

---

## How the Database is Used in the App

Every wardrobe API endpoint queries the database via Drizzle. Here are the patterns:

### Fetch all items for a user
```ts
// GET /api/wardrobe
const result = await db
  .select()
  .from(items)
  .where(eq(items.userId, user.id))
  .orderBy(desc(items.createdAt))
  .limit(100)

return c.json({ items: result })
```

### Create an item
```ts
// POST /api/wardrobe
const body = c.req.valid('json')  // already validated by Zod middleware
const result = await db
  .insert(items)
  .values({ ...body, userId: user.id })
  .returning()

return c.json(result[0])
```

### Get total count
```ts
// GET /api/wardrobe/total-items
const result = await db
  .select({ count: count() })
  .from(items)
  .where(eq(items.userId, user.id))

return c.json({ total: result[0].count })
```

### Delete an item (+ S3 cleanup)
```ts
// DELETE /api/wardrobe/:id
const item = await db
  .delete(items)
  .where(and(eq(items.id, id), eq(items.userId, user.id)))  // user must own the item
  .returning()

// Also delete the image from S3
await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: extractKey(item[0].imageUrl) }))
```

Note the `and(eq(items.id, id), eq(items.userId, user.id))` pattern — this ensures users can only delete **their own** items, not anyone else's. Same pattern applies to GET and PUT by ID.
