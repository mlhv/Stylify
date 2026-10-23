import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { useState } from 'react'

import { ItemForm, type ItemFields } from '@/components/ItemForm'
import { Screen } from '@/components/ui/Screen'
import { createItem, getAllItemsQueryOptions, getTotalClothesQueryOptions } from '@/lib/api'
import { uploadUnlessDone, type UploadedPhoto } from '@/lib/reuseUpload'
import { uploadImage } from '@/lib/upload'

export default function Add() {
  const queryClient = useQueryClient()
  const router = useRouter()
  // Changing the key remounts the form, which empties it after a save.
  const [formKey, setFormKey] = useState(0)
  // A photo that reached S3 but whose item was not saved; reused on retry.
  const [uploaded, setUploaded] = useState<UploadedPhoto | null>(null)

  async function save(fields: ItemFields, photoUri: string | null) {
    if (!photoUri) throw new Error('Add a photo first')
    const photo = await uploadUnlessDone(uploaded, photoUri, uploadImage)
    setUploaded(photo)
    const imageUrl = photo.url

    const newItem = await createItem({ value: { ...fields, imageUrl } })

    queryClient.setQueryData(getAllItemsQueryOptions.queryKey, (old) =>
      old ? { ...old, items: [newItem, ...old.items] } : old,
    )
    queryClient.setQueryData(getTotalClothesQueryOptions.queryKey, (old) =>
      old ? { ...old, total: old.total + 1 } : old,
    )
    setUploaded(null)
    setFormKey((key) => key + 1)
    router.navigate('/')
  }

  return (
    <Screen title="New piece">
      <ItemForm key={formKey} submitLabel="Add to closet" onSubmit={save} />
    </Screen>
  )
}
