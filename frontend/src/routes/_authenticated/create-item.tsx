import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'

import { createItem, getAllItemsQueryOptions, loadingCreateItemQueryOptions, getSignedURL, getTotalClothesQueryOptions } from '@/lib/api'
import { useQueryClient } from '@tanstack/react-query'

import { type createItem as CreateItemValue } from '@stylify/shared'
import { ItemForm } from '@/components/app/ItemForm'

export const Route = createFileRoute('/_authenticated/create-item')({
  component: CreateItem,
})

const emptyItem: CreateItemValue = {
  name: '',
  type: '',
  size: '',
  color: '',
  imageUrl: '',
}

function CreateItem() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const onSubmit = async (value: CreateItemValue, image: File | undefined) => {
      const existingItems = await queryClient.ensureQueryData(getAllItemsQueryOptions)
      const currentTotal = await queryClient.ensureQueryData(getTotalClothesQueryOptions)

      navigate({ to: '/' })

      //loading state
      queryClient.setQueryData(loadingCreateItemQueryOptions.queryKey, {item: value})

      try {
        // Handle image upload
        let uploadedImageUrl = ''
        if (image) {
          const { signedURL } = await getSignedURL()
          const res = await fetch(signedURL, {
            method: 'PUT',
            headers: {
              'Content-Type': image.type,
            },
            body: image,
          })
          if (!res.ok) {
            throw new Error('Failed to upload image')
          }
          uploadedImageUrl = signedURL.split('?')[0]
        }

        const newItem = await createItem({
          value: {
            ...value,
            imageUrl: uploadedImageUrl,
          }
          });

        queryClient.setQueryData(getAllItemsQueryOptions.queryKey, {
          ...existingItems,
          items: [newItem, ...existingItems.items],
        });

        queryClient.setQueryData(getTotalClothesQueryOptions.queryKey, {
          ...currentTotal,
          total: currentTotal.total + 1,
        });

        toast(`Added ${newItem.name} to your closet`)
      } catch (error) {
        //error state
        toast("Couldn't add that piece. Try again?")
      } finally {
        //clean up loading state
        queryClient.setQueryData(loadingCreateItemQueryOptions.queryKey, {})
      }
  }

  return (
    <ItemForm
      title="New piece"
      defaultValues={emptyItem}
      requirePhoto
      submitLabel="Add to closet"
      onSubmit={onSubmit}
    />
  )
}
