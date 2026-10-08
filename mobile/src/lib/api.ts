import { hc } from 'hono/client'
import type { ApiRoutes } from '@server/app'
import { queryOptions } from '@tanstack/react-query'
import type { createItem as CreateItem } from '@stylify/shared'

import { createAuthFetch, type AuthFetchDeps } from './authFetch'
import { API_URL } from './config'

type AuthHandlers = Omit<AuthFetchDeps, 'fetchImpl'>

// The Kinde functions only exist inside React (useKindeAuth). AuthBridge hands
// them over here so this module-level client can use them.
let handlers: AuthHandlers | null = null

export function setAuthHandlers(next: AuthHandlers | null) {
  handlers = next
}

const authFetch = createAuthFetch({
  getAccessToken: async () => (handlers ? handlers.getAccessToken() : null),
  refresh: async () => (handlers ? handlers.refresh() : false),
  onSignedOut: async () => {
    await handlers?.onSignedOut()
  },
})

const client = hc<ApiRoutes>(API_URL, { fetch: authFetch })

export const api = client.api

async function getAllItems() {
  const res = await api.wardrobe.$get()
  if (!res.ok) throw new Error('Could not load your wardrobe')
  return res.json()
}

// The routes that can answer c.notFound() lose their response type in the RPC
// client, so their results are asserted to this shape instead.
export type Item = Awaited<ReturnType<typeof getAllItems>>['items'][number]

export const getAllItemsQueryOptions = queryOptions({
  queryKey: ['get-all-items'],
  queryFn: getAllItems,
  staleTime: 1000 * 60 * 5,
})

async function getTotalClothes() {
  const res = await api.wardrobe['total-items'].$get()
  if (!res.ok) throw new Error('Could not load the item count')
  return res.json()
}

export const getTotalClothesQueryOptions = queryOptions({
  queryKey: ['get-total-clothes'],
  queryFn: getTotalClothes,
  staleTime: 1000 * 60 * 5,
})

export async function getCurrentUser() {
  const res = await api.me.$get()
  if (!res.ok) throw new Error('Could not load the current user')
  return res.json()
}

export async function getItem({ id }: { id: number }) {
  const res = await api.wardrobe[':id{[0-9]+}'].$get({ param: { id: id.toString() } })
  if (!res.ok) throw new Error('Could not load this item')
  return (await res.json()) as { item: Item }
}

export const getItemQueryOptions = (id: number) =>
  queryOptions({
    queryKey: ['get-item', id],
    queryFn: () => getItem({ id }),
    staleTime: 1000 * 60 * 5,
  })

export async function getSignedURL() {
  const res = await api['signed-url'].$get()
  if (!res.ok) throw new Error('Could not start the upload')
  return res.json()
}

export async function createItem({ value }: { value: CreateItem }) {
  const res = await api.wardrobe.$post({ json: value })
  if (!res.ok) throw new Error('Could not save the item')
  return res.json()
}

export async function editItem({ id, value }: { id: number; value: CreateItem }) {
  const res = await api.wardrobe[':id{[0-9]+}'].$put({ param: { id: id.toString() }, json: value })
  if (!res.ok) throw new Error('Could not save the item')
  return (await res.json()) as Item
}

export async function deleteItem({ id }: { id: number }) {
  const res = await api.wardrobe[':id{[0-9]+}'].$delete({ param: { id: id.toString() } })
  if (!res.ok) throw new Error('Could not delete the item')
}
