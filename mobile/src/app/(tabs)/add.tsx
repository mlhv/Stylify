import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { useState } from 'react'

import { ItemForm, type ItemFields } from '@/components/ItemForm'
import { createItem, getAllItemsQueryOptions, getTotalClothesQueryOptions } from '@/lib/api'
import { uploadImage } from '@/lib/upload'

export default function Add() {
  const queryClient = useQueryClient()
  const router = useRouter()
  // Changing the key remounts the form, which empties it after a save.
  const [formKey, setFormKey] = useState(0)
  // A photo that reached S3 but whose item was not saved; reused on retry.
  const [uploaded, setUploaded] = useState<{ uri: string; url: string } | null>(null)

  async function save(fields: ItemFields, photoUri: string | null) {
    if (!photoUri) throw new Error('Add a photo first')
    let imageUrl: string
    if (uploaded?.uri === photoUri) {
      imageUrl = uploaded.url
    } else {
      imageUrl = await uploadImage(photoUri)
      setUploaded({ uri: photoUri, url: imageUrl })
    }

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

  return <ItemForm key={formKey} submitLabel="Add item" onSubmit={save} />
}
