import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import { useState, useEffect, useCallback } from 'react'

import {
  deleteItem,
  editItem,
  getAllItemsQueryOptions,
  loadingEditItemQueryOptions,
  getItemQueryOptions,
  getSignedURL,
  getTotalClothesQueryOptions,
  ItemNotFoundError,
} from '@/lib/api'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type createItem } from '@stylify/shared'
import { ItemForm } from '@/components/app/ItemForm'
import { ChunkyButton } from '@/components/app/ChunkyButton'
import { ErrorPanel } from '@/components/app/ErrorPanel'

export const Route = createFileRoute('/_authenticated/edit-item/$id')({
  component: EditItem,
})

function EditItem() {
  const params = Route.useParams()
  const itemId = parseInt(params.id, 10)
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  // Fetch the current item data
  const { data: itemData, isLoading, error, refetch } = useQuery(
    getItemQueryOptions(itemId),
  )
  const itemIsGone = error instanceof ItemNotFoundError

  // The wardrobe list and count may still show an item that was deleted elsewhere.
  const forgetItem = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: getAllItemsQueryOptions.queryKey })
    queryClient.invalidateQueries({ queryKey: getTotalClothesQueryOptions.queryKey })
  }, [queryClient])

  useEffect(() => {
    if (itemIsGone) {
      forgetItem()
    }
  }, [itemIsGone, forgetItem])

  const onSubmit = async (value: createItem, image: File | undefined) => {
      const existingItems = await queryClient.ensureQueryData(
        getAllItemsQueryOptions,
      )

      navigate({ to: '/' })

      // Loading state
      queryClient.setQueryData(loadingEditItemQueryOptions.queryKey, {
        item: {
          ...value,
          imageUrl: value.imageUrl || '',
        }
      })

      try {
        // Handle image upload if there's a new image
        let uploadedImageUrl = value.imageUrl // Keep existing image URL by default
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

        const updatedItem = await editItem({
          id: itemId,
          value: {
            ...value,
            imageUrl: uploadedImageUrl,
          },
        })

        // Update the items list in cache
        queryClient.setQueryData(getAllItemsQueryOptions.queryKey, {
          ...existingItems,
          items: existingItems.items.map((item: any) =>
            item.id === updatedItem.id ? updatedItem : item,
          ),
        })

        toast(`Saved ${updatedItem.name}`)
      } catch (error) {
        queryClient.setQueryData(loadingEditItemQueryOptions.queryKey, {
          item: undefined
        })

        if (error instanceof ItemNotFoundError) {
          forgetItem()
          toast('That piece is gone', {
            description: 'It may have been deleted on another device.',
          })
        } else {
          toast("Couldn't save that piece. Try again?")
        }
      } finally {
        queryClient.setQueryData(loadingEditItemQueryOptions.queryKey, {})
      }
  }

  if (isLoading) {
    return <ItemFormSkeleton />
  }

  if (itemIsGone) {
    return (
      <div className="px-4 py-8">
        <ErrorPanel
          title="This piece is gone"
          message="It may have been deleted on another device."
          actionLabel="Back to closet"
          onAction={() => navigate({ to: '/' })}
        />
      </div>
    )
  }

  if (error || !itemData) {
    return (
      <div className="px-4 py-8">
        <ErrorPanel
          title="Couldn't load this piece"
          message={error?.message ?? 'Something went wrong.'}
          onAction={() => void refetch()}
        />
      </div>
    )
  }

  const { item } = itemData
  return (
    <ItemForm
      // A fresh form for each item, seeded from the loaded item.
      key={item.id}
      title="Edit piece"
      defaultValues={{
        name: item.name ?? '',
        type: item.type ?? '',
        size: item.size ?? '',
        color: item.color ?? '',
        imageUrl: item.imageUrl,
      }}
      currentImageUrl={item.imageUrl || undefined}
      requirePhoto={false}
      submitLabel="Save changes"
      onSubmit={onSubmit}
      footer={<DeletePiece id={item.id} name={item.name} />}
    />
  )
}

function DeletePiece({ id, name }: { id: number; name: string | null }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [confirming, setConfirming] = useState(false)

  const mutation = useMutation({
    mutationFn: deleteItem,
    onError: () => {
      toast("Couldn't delete that piece. Try again?")
    },
    onSuccess: () => {
      toast(`Deleted ${name}`)

      // Edit can be opened directly (a refresh or a pasted link), so the list
      // and the total may not be cached yet. Update only what is cached; the
      // closet fetches anything missing, which already leaves this item out.
      // (Fetching the total here, as the closet's old delete button did, would
      // read the count after the delete and then subtract one again.)
      queryClient.setQueryData(
        getAllItemsQueryOptions.queryKey,
        (existingItems) =>
          existingItems && {
            ...existingItems,
            items: existingItems.items.filter((item) => item.id !== id),
          },
      )

      queryClient.setQueryData(
        getTotalClothesQueryOptions.queryKey,
        (currentTotal) =>
          currentTotal && {
            ...currentTotal,
            total: currentTotal.total - 1,
          },
      )

      navigate({ to: '/' })
    },
  })

  if (!confirming) {
    return (
      <ChunkyButton variant="secondary" className="w-full text-danger" onClick={() => setConfirming(true)}>
        Delete piece
      </ChunkyButton>
    )
  }

  return (
    <div role="group" aria-label="Confirm delete" className="rounded-[20px] border-2 border-line bg-white p-4">
      <p className="font-extrabold">Delete this piece? This can't be undone.</p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <ChunkyButton
          variant="danger"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate({ id })}
        >
          {mutation.isPending ? 'Deleting…' : 'Delete'}
        </ChunkyButton>
        <ChunkyButton variant="quiet" disabled={mutation.isPending} onClick={() => setConfirming(false)}>
          Keep it
        </ChunkyButton>
      </div>
    </div>
  )
}

function ItemFormSkeleton() {
  const bar = 'animate-pulse rounded-full bg-line'
  return (
    <div aria-hidden="true" className="mx-auto max-w-md px-4 py-8">
      <div className={`${bar} h-10 w-48`} />
      <div className="mt-6 aspect-square w-full animate-pulse rounded-[20px] bg-line" />
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="mt-5">
          <div className={`${bar} h-4 w-16`} />
          <div className="mt-2 h-12 w-full animate-pulse rounded-[14px] bg-line" />
        </div>
      ))}
      <div className="mt-7 h-14 w-full animate-pulse rounded-2xl bg-line" />
    </div>
  )
}
