import { z } from 'zod'
import { insertItemsSchema } from './db/schema/items'

export const createItemSchema = insertItemsSchema.omit({ 
    userId: true , 
    createdAt: true,
    id: true,
});

export type createItem = z.infer<typeof createItemSchema>

