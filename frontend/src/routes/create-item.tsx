import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import { useForm } from '@tanstack/react-form'
import { Button } from '@/components/ui/button'

import { api } from '@/lib/api'

export const Route = createFileRoute('/create-item')({
  component: CreateItem,
})

function CreateItem() {
  const navigate = useNavigate()
  const form = useForm({
    defaultValues: {
      name: '',
      type: '',
      size: '',
      color: '',
    },
    onSubmit: async ({ value }) => {
      const res = await api.wardrobe.$post({ json: value });
      if (!res.ok) {
        throw new Error("Network response was not ok");
      }
      navigate({to: '/items'})
    },
  })

  return (
    <div className="max-w-md mx-auto mt-8">
      <h1 className="text-2xl font-bold mb-4">Add Clothing Item</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        }}
        className="space-y-4"
      >
        <div>
          <form.Field
            name="name"
            validators={{
              onChange: ({ value }) =>
                !value
                  ? 'Name is required'
                  : value.length < 2
                  ? 'Name must be at least 2 characters'
                  : undefined,
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
                {field.state.meta.isTouched && field.state.meta.errors.length ? (
                  <em>{field.state.meta.errors.join(", ")}</em>
                ) : null}
              </>
            )}
          </form.Field>
        </div>
        <div>
          <form.Field
            name="type"
            validators={{
              onChange: ({ value }) =>
                !value ? 'Type is required' : undefined,
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
                {field.state.meta.isTouched && field.state.meta.errors.length ? (
                  <em>{field.state.meta.errors.join(", ")}</em>
                ) : null}
              </>
            )}
          </form.Field>
        </div>
        <div>
          <form.Field
            name="size"
            validators={{
              onChange: ({ value }) =>
                !value ? 'Size is required' : undefined,
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
                {field.state.meta.isTouched && field.state.meta.errors.length ? (
                  <em>{field.state.meta.errors.join(", ")}</em>
                ) : null}
              </>
            )}
          </form.Field>
        </div>
        <div>
          <form.Field
            name="color"
            validators={{
              onChange: ({ value }) =>
                !value ? 'Color is required' : undefined,
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
                {field.state.meta.isTouched && field.state.meta.errors.length ? (
                  <em>{field.state.meta.errors.join(", ")}</em>
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
  );
}
