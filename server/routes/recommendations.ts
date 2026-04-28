import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { getUser } from '../kinde'

export const recommendationsRoute = new Hono()
    .get('/', getUser, async (c) => {
        const user = c.var.user
        const items = await db
        .select()
        .from(itemTable)
        .where(eq(itemTable.userId, user.id,))
        .orderBy(desc(itemTable.createdAt))
        .limit(100)

        return c.json({ items: items})
    })