import { z } from 'zod'

export const createItemSchema = z.object({
  name: z.string().min(1, 'Name must be at least 1 character long'),
  type: z.string().min(1, 'Type must be at least 1 character long'),
  size: z.string().min(1, 'Size must be at least 1 character long'),
  color: z.string().min(1, 'Color must be at least 1 character long'),
  imageUrl: z.string().url('Image URL must be a valid URL'),
})

export type createItem = z.infer<typeof createItemSchema>

export type OutfitSuggestion = {
  title: string
  itemIds: number[]
  reasoning: string
}
