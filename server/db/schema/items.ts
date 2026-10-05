import { text, pgTable, serial, index, varchar, timestamp } from 'drizzle-orm/pg-core';
import { z } from 'zod';

import { createItemSchema } from '@stylify/shared';

// Any time schema is changed, run bun drizzle-kit generate to generate the new migrations
// Then run bun migrate.ts to apply the migrations
// Then run bunx drizzle-kit studio to open the studio and inspect the data

export const items = pgTable('items', 
{
  id: serial('id').primaryKey(),
  userId : text('user_id').notNull(),
  name: varchar('name', { length: 256 }),
  size: varchar('size', { length: 256 }),
  type: varchar('type', { length: 256 }),
  color: varchar('color', { length: 256 }),
  createdAt: timestamp('created_at').defaultNow(),
  lastWornAt: timestamp('last_worn_at'),
  imageUrl: text('image_url').notNull(),
},
 (items) => {
  return {
    userIdIndex: index('name_idx').on(items.userId),
  }
});

// Server-side insert schema = client contract + userId injected by the route.
export const insertItemsSchema = createItemSchema.extend({
  userId: z.string().min(1),
});