import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native'

import { ErrorState, errorMessage } from '@/components/ErrorState'
import { ItemForm, type ItemFields } from '@/components/ItemForm'
import {
  deleteItem,
  editItem,
  getAllItemsQueryOptions,
  getItemQueryOptions,
  getTotalClothesQueryOptions,
  ItemNotFoundError,
} from '@/lib/api'
import { uploadImage } from '@/lib/upload'

// Drops an item from the cached list and count, as a successful delete does.
function dropFromCaches(queryClient: QueryClient, id: number) {
  queryClient.setQueryData(getAllItemsQueryOptions.queryKey, (old) =>
    old ? { ...old, items: old.items.filter((existing) => existing.id !== id) } : old,
  )
  queryClient.setQueryData(getTotalClothesQueryOptions.queryKey, (old) =>
    old ? { ...old, total: Math.max(0, old.total - 1) } : old,
  )
}

export default function EditItem() {
  const params = useLocalSearchParams<{ id: string }>()
  const id = Number(params.id)
  const queryClient = useQueryClient()
  const router = useRouter()
  const [deleting, setDeleting] = useState(false)
  // Always ask the server on open: the item may have been deleted elsewhere since it was cached.
  const { data, error, isPending, refetch } = useQuery({
    ...getItemQueryOptions(id),
    enabled: Number.isInteger(id),
    refetchOnMount: 'always',
  })
  const dropped = useRef(false)
  const gone = error instanceof ItemNotFoundError

  useEffect(() => {
    if (!gone || dropped.current) return
    dropped.current = true
    dropFromCaches(queryClient, id)
  }, [gone, id, queryClient])

  if (!Number.isInteger(id)) return <ErrorState error={new Error('This item does not exist')} onRetry={() => router.back()} />
  if (gone) return <ErrorState error={error} retryLabel="Back to wardrobe" onRetry={() => router.back()} />
  if (isPending) return <ActivityIndicator className="flex-1" />
  if (error && !data) return <ErrorState error={error} onRetry={() => void refetch()} />

  const item = data.item

  async function save(fields: ItemFields, photoUri: string | null) {
    const imageUrl = photoUri ? await uploadImage(photoUri) : item.imageUrl
    const updated = await editItem({ id, value: { ...fields, imageUrl } })
    queryClient.setQueryData(getItemQueryOptions(id).queryKey, { item: updated })
    queryClient.setQueryData(getAllItemsQueryOptions.queryKey, (old) =>
      old ? { ...old, items: old.items.map((existing) => (existing.id === id ? updated : existing)) } : old,
    )
    router.back()
  }

  async function remove() {
    setDeleting(true)
    try {
      await deleteItem({ id })
      dropFromCaches(queryClient, id)
      queryClient.removeQueries({ queryKey: getItemQueryOptions(id).queryKey })
      router.back()
    } catch (e) {
      setDeleting(false)
      Alert.alert('Could not delete', errorMessage(e))
    }
  }

  function confirmDelete() {
    Alert.alert('Delete this item?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void remove() },
    ])
  }

  return (
    <View className="flex-1 bg-white">
      <ItemForm
        initial={{ name: item.name ?? '', type: item.type ?? '', size: item.size ?? '', color: item.color ?? '' }}
        currentImageUrl={item.imageUrl}
        submitLabel="Save changes"
        onSubmit={save}
      />
      <Pressable className="m-4 items-center rounded-lg border border-red-600 py-4" disabled={deleting} onPress={confirmDelete}>
        {deleting ? <ActivityIndicator /> : <Text className="font-semibold text-red-600">Delete item</Text>}
      </Pressable>
    </View>
  )
}
