// In edit-item.tsx
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useForm } from '@tanstack/react-form'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { useState, useEffect } from 'react'

import {
  editItem,
  getAllItemsQueryOptions,
  loadingEditItemQueryOptions,
  getItemQueryOptions,
  getSignedURL,
} from '@/lib/api'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { zodValidator } from '@tanstack/zod-form-adapter'
import { createItemSchema } from '@server/sharedTypes'

export const Route = createFileRoute('/_authenticated/edit-item/$id')({
  component: EditItem,
})

function EditItem() {
  const params = Route.useParams()
  const itemId = parseInt(params.id, 10)
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [image, setImage] = useState<File | undefined>(undefined)
  const [imageUrl, setImageUrl] = useState<string | undefined>(undefined)

  // Fetch the current item data
  const { data: itemData, isLoading } = useQuery(
    getItemQueryOptions(itemId),
  )

  const form = useForm({
    validatorAdapter: zodValidator(),
    defaultValues: {
      name: '',
      type: '',
      size: '',
      color: '',
      imageUrl: '',
    },
    onSubmit: async ({ value }) => {
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

        toast('Item Updated', {
          description: `Successfully updated item: ${updatedItem.name}`,
        })
      } catch (error) {
        queryClient.setQueryData(loadingEditItemQueryOptions.queryKey, {
          item: undefined
        })

        toast('An error occurred', {
          description: 'Failed to update item',
        })
      } finally {
        queryClient.setQueryData(loadingEditItemQueryOptions.queryKey, {})
      }
    },
  })

  // Set initial form values when item data is loaded
  useEffect(() => {
    if (itemData?.item) {
      // Use setValue for each field instead of reset
      form.setFieldValue('name', itemData.item.name)
      form.setFieldValue('type', itemData.item.type)
      form.setFieldValue('size', itemData.item.size)
      form.setFieldValue('color', itemData.item.color)
      form.setFieldValue('imageUrl', itemData.item.imageUrl)
      setImageUrl(itemData.item.imageUrl)
    }
  }, [itemData, form])

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const image = e.target.files?.[0]
    setImage(image)

    if (imageUrl) {
      URL.revokeObjectURL(imageUrl)
    }

    if (image) {
      const url = URL.createObjectURL(image)
      setImageUrl(url)
    }
  }

  if (isLoading) {
    return <div>Loading...</div>
  }

  // Rest of the component JSX is similar to create-item.tsx
  // You can copy the JSX from create-item.tsx and update the title to "Edit Clothing Item"
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

        {imageUrl && image && (
          <div className="flex gap-4 items-center">
            {image.type.startsWith('image/') ? (
              <div className="rounded-lg overflow-hidden w-24 h-24 relative">
                <img className="object-cover" src={imageUrl} alt={image.name} />
              </div>
            ) : (
              <div className="rounded-lg overflow-hidden w-24 h-24 flex items-center justify-center bg-gray-200 text-gray-600">
                <span>Invalid image</span>
              </div>
            )}

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
                {isSubmitting ? '...' : 'Submit'}
              </Button>
              <Button
                type="button"
                onClick={() => {
                  form.reset()
                  setImage(undefined)
                }}
                className="px-4 py-2 bg-gray-300 rounded"
              >
                Reset
              </Button>
            </div>
          )}
        </form.Subscribe>
      </form>
    </div>
  )
}
