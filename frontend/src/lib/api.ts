import { hc } from 'hono/client'
import { type ApiRoutes } from '@server/app'
import { queryOptions } from '@tanstack/react-query'
import { createItem, type createItem } from '@server/sharedTypes'

const client = hc<ApiRoutes>('/')

export const api = client.api

async function getCurrentUser() {
    const res = await api.me.$get()
    if (!res.ok) {
      throw new Error('Network response was not ok')
    }
    const data = res.json()
    return data
  }

export const userQueryOptions = queryOptions({ 
    queryKey: ['get-current-user'], 
    queryFn: getCurrentUser,
    staleTime: Infinity
})
  
export async function getTotalCLothes() {
      const res = await api.wardrobe['total-items'].$get()
      if (!res.ok) {
        throw new Error('Network response was not ok')
      }
      const data = res.json()
      return data
}

export const getTotalClothesQueryOptions = queryOptions({
    queryKey: ['get-total-clothes'],
    queryFn: getTotalCLothes,
    staleTime: 1000 * 60 * 5,
})

export async function getAllItems() {
    const res = await api.wardrobe.$get()
    if (!res.ok) {
      throw new Error('Network response was not ok')
    }
    const data = res.json()
    return data
}
  
export const getAllItemsQueryOptions = queryOptions({
    queryKey: ['get-all-items'],
    queryFn: getAllItems,
    staleTime: 1000 * 60 * 5,
})
  
export async function createItem({ value} : { value: createItem }) {
    const res = await api.wardrobe.$post({ json: value })
    if (!res.ok) {
    throw new Error('Network response was not ok')
  }
  const newItem = await res.json()
  return newItem
}

export const loadingCreateItemQueryOptions = queryOptions<{item?: createItem;}>({
    queryKey: ['loading-create-item'],
    queryFn: async () => {
      return {};
    },
    staleTime: Infinity,
})

export async function deleteItem({ id }: { id: number }) {
  const res = await api.wardrobe[':id{[0-9]+}'].$delete({param: {id : id.toString()}})
  if (!res.ok) {
    throw new Error('Network response was not ok')
  }
  return
}

export async function updateItem({ id, value }: { id: number, value: createItem}) {
  const res = await api.wardrobe[':id{[0-9]+}'].$put({param: {id : id.toString()}, json: value})
  if (!res.ok) {
    throw new Error('Network response was not ok')
  }
  const updatedItem = await res.json()
  return updatedItem
}

export async function getSignedURL() {
  const res = await api['signed-url'].$get()
  if (!res.ok) {
    throw new Error('Network response was not ok')
  }
  const data = await res.json()
  return data
}

export const getSignedURLQueryOptions = queryOptions({
    queryKey: ['get-signed-url'],
    queryFn: getSignedURL,
})