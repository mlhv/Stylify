import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { getUser } from '../kinde'

import { db } from '../db'
import { items as itemTable, insertItemsSchema } from '../db/schema/items'
import { eq, desc, and, count } from 'drizzle-orm'

import { createItemSchema } from '../sharedTypes'

import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";


const s3 = new S3Client({
    region: process.env.AWS_BUCKET_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!
    }
});

export const wardrobeRoute = new Hono()
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
    .post('/', getUser, zValidator("json", createItemSchema), async (c) => {
        const item = await c.req.valid("json")
        const user = c.var.user

        const validatedItem = insertItemsSchema.parse({
            ...item,
            userId: user.id,
        })

        const result = await db
        .insert(itemTable)
        .values(validatedItem)
        .returning()
        .then(res => res[0])

        c.status(201)
        return c.json(result);
    })
    .get('/total-items', getUser, async (c) => {
        const user = c.var.user
        const result = await db
        .select({ total: count(itemTable.id) })
        .from(itemTable)
        .where(eq(itemTable.userId, user.id))
        .limit(1)
        .then(res => res[0])
        return c.json(result)
    })
    .get('/:id{[0-9]+}', getUser, async (c) => {
        const id = Number.parseInt(c.req.param('id'));
        const user = c.var.user
        const item = await db
        .select()
        .from(itemTable)
        .where(and(eq(itemTable.userId, user.id), eq(itemTable.id, id)))
        .then(res => res[0])

        if (!item) {
            return c.notFound()
        }
        return c.json({ item })
    })
    .delete('/:id{[0-9]+}', getUser, async (c) => {
        const id = Number.parseInt(c.req.param('id'));
        const user = c.var.user
        const item = await db
        .delete(itemTable)
        .where(and(eq(itemTable.userId, user.id), eq(itemTable.id, id)))
        .returning()
        .then(res => res[0])

        if (!item) {
            return c.notFound()
        }
        // Delete image from S3
        const deleteObjectCommand = new DeleteObjectCommand({
            Bucket: process.env.AWS_BUCKET_NAME!,
            Key: item.imageUrl.split('/').pop()!,
        });
        
        try {
            await s3.send(deleteObjectCommand);
        } catch (error) {
            console.error('Error deleting object from S3:', error);
        }

        return c.json({ item })
    });
