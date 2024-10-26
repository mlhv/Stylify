import { getAllItemsQueryOptions, getSignedURL, updateItem } from '@/lib/api'
import { useForm } from '@tanstack/react-form'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { toast } from 'sonner'
import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useNavigate } from '@tanstack/react-router'

import { useMutation } from '@tanstack/react-query'
import { zodValidator } from '@tanstack/zod-form-adapter'
import { createItemSchema } from '@server/sharedTypes'

export const Route = createFileRoute('/_authenticated/edit-item')({
  component: EditItem,
})

function EditItem() {
  const { itemId } = Route.useParams()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [image, setImage] = useState<File | undefined>(undefined)
  const [imageUrl, setImageUrl] = useState<string | undefined>(undefined)

  const { data } = useQuery(getAllItemsQueryOptions)
  const item = data?.items.find((item) => item.id === Number(itemId))

  const mutation = useMutation({
    mutationFn: updateItem,
    onSuccess: (updatedItem) => {
      queryClient.setQueryData(
        getAllItemsQueryOptions.queryKey,
        (existingData: any) => ({
          ...existingData,
          items: existingData.items.map((item: any) =>
            item.id === Number(itemId) ? updatedItem : item
          ),
        })
      )
      toast('Item Updated', {
        description: `Successfully updated item: ${updatedItem.name}`,
      })
      navigate({ to: '/' })
    },
    onError: () => {
      toast('Error', {
        description: 'Failed to update item',
      })
    },
  })

  const form = useForm({
    validatorAdapter: zodValidator(),
    defaultValues: {
      name: item?.name ?? '',
      type: item?.type ?? '',
      size: item?.size ?? '',
      color: item?.color ?? '',
      imageUrl: item?.imageUrl ?? '',
    },
    onSubmit: async ({ value }) => {
      try {
        let uploadedImageUrl = item?.imageUrl ?? ''
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

        mutation.mutate({
          id: Number(itemId),
          value: {
            ...value,
            imageUrl: uploadedImageUrl,
          },
        })
      } catch (error) {
        toast('Error', {
          description: 'Failed to upload image',
        })
      }
    },
  })

  // Set initial image URL from item data
  useEffect(() => {
    if (item?.imageUrl) {
      setImageUrl(item.imageUrl)
    }
  }, [item])

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const image = e.target.files?.[0]
    setImage(image)

    if (imageUrl) {
      URL.revokeObjectURL(imageUrl)
    }

    if (image) {
      const url = URL.createObjectURL(image)
      setImageUrl(url)
    } else {
      setImageUrl(item?.imageUrl)
    }
  }

  if (!item) {
    return <div>Item not found</div>
  }

  return (
    <div className="max-w-md mx-auto mt-8">
      <h1 className="text-2xl font-bold mb-4">Edit Clothing Item</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          e.stopPropagation()
          form.handleSubmit()
        }}
        className="space-y-4"
      >
        <div>
          <form.Field
            name="name"
            validators={{
              onChange: createItemSchema.shape.name,
            }}
          >
            {(field) => (
              <>
                <Label htmlFor={field.name} className="block mb-1">
                  Name:
                </Label>
                <Input
                  id={field.name}
                  name={field.name}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  className="w-full px-3 py-2 border rounded"
                />
                {field.state.meta.isTouched &&
                field.state.meta.errors.length ? (
                  <em>{field.state.meta.errors.join(', ')}</em>
                ) : null}
              </>
            )}
          </form.Field>
        </div>
        <div>
          <form.Field
            name="type"
            validators={{
              onChange: createItemSchema.shape.type,
            }}
          >
            {(field) => (
              <>
                <Label htmlFor={field.name} className="block mb-1">
                  Type:
                </Label>
                <Input
                  id={field.name}
                  name={field.name}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  className="w-full px-3 py-2 border rounded"
                />
                {field.state.meta.isTouched &&
                field.state.meta.errors.length ? (
                  <em>{field.state.meta.errors.join(', ')}</em>
                ) : null}
              </>
            )}
          </form.Field>
        </div>
        <div>
          <form.Field
            name="size"
            validators={{
              onChange: createItemSchema.shape.size,
            }}
          >
            {(field) => (
              <>
                <Label htmlFor={field.name} className="block mb-1">
                  Size:
                </Label>
                <Input
                  id={field.name}
                  name={field.name}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  className="w-full px-3 py-2 border rounded"
                />
                {field.state.meta.isTouched &&
                field.state.meta.errors.length ? (
                  <em>{field.state.meta.errors.join(', ')}</em>
                ) : null}
              </>
            )}
          </form.Field>
        </div>
        <div>
          <form.Field
            name="color"
            validators={{
              onChange: createItemSchema.shape.color,
            }}
          >
            {(field) => (
              <>
                <Label htmlFor={field.name} className="block mb-1">
                  Color:
                </Label>
                <Input
                  id={field.name}
                  name={field.name}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  className="w-full px-3 py-2 border rounded"
                />
                {field.state.meta.isTouched &&
                field.state.meta.errors.length ? (
                  <em>{field.state.meta.errors.join(', ')}</em>
                ) : null}
              </>
            )}
          </form.Field>
        </div>

        {imageUrl && (
          <div className="flex gap-4 items-center">
            <div className="rounded-lg overflow-hidden w-24 h-24 relative">
              <img className="object-cover" src={imageUrl} alt="Item preview" />
            </div>
            <Button
              type="button"
              onClick={() => {
                setImage(undefined)
                setImageUrl(undefined)
              }}
              className="px-4 py-2 bg-gray-300 rounded"
            >
              Remove
            </Button>
          </div>
        )}

        <div>
          <Label htmlFor="image" className="block mb-1">
            Image:
          </Label>
          <Input
            id="image"
            name="image"
            type="file"
            accept="image/*"
            onChange={handleImageChange}
            className="w-full px-3 py-2 border rounded"
          />
        </div>

        <form.Subscribe
          selector={(state) => [state.canSubmit, state.isSubmitting]}
        >
          {([canSubmit, isSubmitting]) => (
            <div className="flex space-x-4">
              <Button
                type="submit"
                disabled={!canSubmit}
                className="px-4 py-2 bg-blue-500 text-white rounded disabled:opacity-50"
              >
                {isSubmitting ? '...' : 'Save Changes'}
              </Button>
              <Button
                type="button"
                onClick={() => navigate({ to: '/' })}
                className="px-4 py-2 bg-gray-300 rounded"
              >
                Cancel
              </Button>
            </div>
          )}
        </form.Subscribe>
      </form>
    </div>
  )
}

export default EditItem
