import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useForm } from '@tanstack/react-form'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

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
  const form = useForm({
    validatorAdapter: zodValidator(),
    defaultValues: {
      name: '',
      type: '',
      size: '',
      color: '',
    },
    onSubmit: async ({ value }) => {
      const existingItems = await queryClient.ensureQueryData(getAllItemsQueryOptions)
      
      navigate({ to: '/items' })

      //loading state
      queryClient.setQueryData(loadingCreateItemQueryOptions.queryKey, {item: value})

      try {
        const newItem = await createItem({ value });

        queryClient.setQueryData(getAllItemsQueryOptions.queryKey, {
          ...existingItems,
          items: [newItem, ...existingItems.items],
        });
        toast('Item Created', {
          description: `Successfully created a new item: ${newItem.name}`,
          }
        )
        //success state
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
                onClick={() => form.reset()}
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
