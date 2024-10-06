import { text, pgTable, serial, index, varchar, timestamp } from 'drizzle-orm/pg-core';

import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';

export const items = pgTable('items', 
{
  id: serial('id').primaryKey(),
  userId : text('user_id').notNull(),
  name: varchar('name', { length: 256 }),
  size: varchar('size', { length: 256 }),
  type: varchar('type', { length: 256 }),
  color: varchar('color', { length: 256 }),
  createdAt: timestamp('created_at').defaultNow(),
},
 (items) => {
  return {
    userIdIndex: index('name_idx').on(items.userId),
  }
});

// Schema for inserting a user - can be used to validate API requests
export const insertItemsSchema = createInsertSchema(items, {
  id: z.number().int().positive().min(1),
  name: z.string().min(1, 'Name must be at least 1 character long'),
  type: z.string().min(1, 'Type must be at least 1 character long'),
  size: z.string().min(1, 'Size must be at least 1 character long'),
  color: z.string().min(1, 'Color must be at least 1 character long'),
});
// Schema for selecting a user - can be used to validate API responses
export const selectItemsSchema = createSelectSchema(items);