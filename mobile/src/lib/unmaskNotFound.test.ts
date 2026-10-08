import { describe, expect, test } from 'bun:test'

import { unmaskNotFound } from './unmaskNotFound'

const wrap = (res: Response) => unmaskNotFound(async (_input: string) => res)

describe('unmaskNotFound', () => {
  test('a 200 text/html becomes a 404', async () => {
    const res = await wrap(new Response('<html></html>', { status: 200, headers: { 'Content-Type': 'text/html' } }))('/x')
    expect(res.status).toBe(404)
  })
  test('a 200 JSON passes through as the same object', async () => {
    const original = new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' } })
    expect(await wrap(original)('/x')).toBe(original)
  })
  test('a 201 JSON passes through', async () => {
    const original = new Response('{}', { status: 201, headers: { 'Content-Type': 'application/json' } })
    expect(await wrap(original)('/x')).toBe(original)
  })
  for (const status of [404, 401, 500]) {
    test(`a ${status} passes through untouched`, async () => {
      const original = new Response('<html></html>', { status, headers: { 'Content-Type': 'text/html' } })
      expect(await wrap(original)('/x')).toBe(original)
    })
  }
  test('a 2xx without Content-Type passes through', async () => {
    const original = new Response(null, { status: 204 })
    expect(await wrap(original)('/x')).toBe(original)
  })
})
