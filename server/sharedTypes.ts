import { z } from 'zod'
import { insertItemsSchema } from './db/schema/items'

export const createItemSchema = insertItemsSchema.omit({ 
    userId: true , 
    createdAt: true,
    id: true,
    lastWornAt: true,
});

export type OutfitSuggestion = {
    title: string,
    itemIds: number[],
    reasoning: string,
}

export type createItem = z.infer<typeof createItemSchema>

