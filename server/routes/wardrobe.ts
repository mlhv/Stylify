import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import type { Clothes } from '../../models/Clothes'

const fakeClothes: Clothes[]  = [
    {
        id: 1,
        name: "T-Shirt",
        color: "Blue",
        size: "M"
    },
    {
        id: 2,
        name: "Jeans",
        color: "Black",
        size: "L"
    },
    {
        id: 3,
        name: "Dress",
        color: "Red",
        size: "S"
    }
]

const clothesSchema = z.object({
    id: z.number().int().positive().min(1),
    name: z.string(),
    color: z.string(),
    size: z.string()
})

type Clothes = z.infer<typeof clothesSchema>

const createClothesSchema = clothesSchema.omit({ id: true })

export const wardrobeRoute = new Hono()
    .get('/', c => {
        return c.json({ clothes: fakeClothes})
    })
    .post('/', zValidator("json", createClothesSchema), async (c) => {
        const clothes = await c.req.valid("json")
        fakeClothes.push({...clothes, id: fakeClothes.length + 1})
        c.status(201)
        return c.json({clothes});
    })
    .get('/total-clothes', c => {
        return c.json({ totalClothes: fakeClothes.length })
    })
    .get('/:id{[0-9]+}', c => {
        const id = Number.parseInt(c.req.param('id'));
        const clothes = fakeClothes.find(clothes => clothes.id === id)
        if (!clothes) {
            return c.notFound()
        }
        return c.json({ clothes })
    })
    .delete('/:id{[0-9]+}', c => {
        const id = Number.parseInt(c.req.param('id'));
        const index = fakeClothes.findIndex(clothes => clothes.id === id)
        if (index === -1) { 
            return c.notFound()
        }
        const deletedClothes = fakeClothes.splice(index, 1)[0];
        return c.json({ clothes: deletedClothes })
    });
