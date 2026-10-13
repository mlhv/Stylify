import { afterEach, describe, expect, mock, test } from 'bun:test'
import { ItemNotFoundError, editItem, getItem, retryUnlessNotFound } from './api'

const realFetch = globalThis.fetch
const answer = (status: number, body = '') => {
  globalThis.fetch = mock(async () => new Response(body, { status })) as unknown as typeof fetch
}
const item = { name: 'Shirt', type: 'top', size: 'M', color: 'blue', imageUrl: 'https://example.com/a.jpg' }

afterEach(() => {
  globalThis.fetch = realFetch
})

describe('an item that no longer exists', () => {
  test('getItem rejects with ItemNotFoundError on a 404', async () => {
    answer(404, '404 Not Found')
    expect(getItem({ id: 7 })).rejects.toBeInstanceOf(ItemNotFoundError)
  })

  test('editItem rejects with ItemNotFoundError on a 404', async () => {
    answer(404, '404 Not Found')
    expect(editItem({ id: 7, value: item })).rejects.toBeInstanceOf(ItemNotFoundError)
  })

  test('another failure is not reported as a missing item', async () => {
    answer(500, 'boom')
    const error = await getItem({ id: 7 }).catch((e) => e)
    expect(error).toBeInstanceOf(Error)
    expect(error).not.toBeInstanceOf(ItemNotFoundError)
  })

  test('getItem returns the item on success', async () => {
    answer(200, JSON.stringify({ item: { id: 7, ...item } }))
    expect(await getItem({ id: 7 })).toEqual({ item: { id: 7, ...item } })
  })
})

describe('retryUnlessNotFound', () => {
  test('never retries a missing item', () => {
    expect(retryUnlessNotFound(0, new ItemNotFoundError())).toBe(false)
  })

  test('retries other failures up to three times', () => {
    expect(retryUnlessNotFound(0, new Error('x'))).toBe(true)
    expect(retryUnlessNotFound(2, new Error('x'))).toBe(true)
    expect(retryUnlessNotFound(3, new Error('x'))).toBe(false)
  })
})
