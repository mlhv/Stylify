import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useForm } from '@tanstack/react-form'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { useState } from 'react'

import { createItem, getAllItemsQueryOptions, loadingCreateItemQueryOptions } from '@/lib/api'
import { useQueryClient } from '@tanstack/react-query'

import { zodValidator } from '@tanstack/zod-form-adapter'

import { createItemSchema } from '@server/sharedTypes'

export const Route = createFileRoute('/_authenticated/create-item')({
  component: CreateItem,
})

function CreateItem() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [image, setImage] = useState<File | undefined>(undefined)
  const [imageUrl, setImageUrl] = useState<string | undefined>(undefined)
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
      const existingItems = await queryClient.ensureQueryData(getAllItemsQueryOptions)
      
      navigate({ to: '/items' })

      //loading state
      queryClient.setQueryData(loadingCreateItemQueryOptions.queryKey, {item: value})

      try {
        // Handle image upload

        const newItem = await createItem({ value });

        queryClient.setQueryData(getAllItemsQueryOptions.queryKey, {
          ...existingItems,
          items: [newItem, ...existingItems.items],
        });
        toast('Item Created', {
          description: `Successfully created a new item: ${newItem.name}`,
          }
        )
        console.log({newItem, image})
      } catch (error) {
        //error state
        toast('An error occurred', {
          description: `Failed to create a new item`
        })
      } finally {
        //clean up loading state
        queryClient.setQueryData(loadingCreateItemQueryOptions.queryKey, {})
      }
      
    },
  })

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const image = e.target.files?.[0]
    setImage(image)

    if(imageUrl) {
      URL.revokeObjectURL(imageUrl)
    }

    if (image) {
      const url = URL.createObjectURL(image)
      setImageUrl(url)
    } else {
      setImageUrl(undefined)
    }
  }

  return (
    <div className="max-w-md mx-auto mt-8">
      <h1 className="text-2xl font-bold mb-4">Add Clothing Item</h1>
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
            <div className='flex gap-4 items-center'>
              {image.type.startsWith('image/') ? (
                <div className='rounded-lg overflow-hidden w-24 h-24 relative'>
                  <img
                    className='object-cover'
                    src={imageUrl}
                    alt={image.name}
                  />
                </div>
              ) : (
                <div className='rounded-lg overflow-hidden w-24 h-24 flex items-center justify-center bg-gray-200 text-gray-600'>
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
  

