import { useRef, useState, type ReactNode } from 'react'
import { useForm } from '@tanstack/react-form'
import { zodValidator } from '@tanstack/zod-form-adapter'
import { createItemSchema, type createItem } from '@stylify/shared'
import { TYPE_LABELS, TYPE_NAMES, typeKey } from '@stylify/shared/brand'
import { ChunkyButton } from './ChunkyButton'
import { Field } from './Field'
import { PhotoPicker } from './PhotoPicker'
import { TypeChip } from './TypeChip'

type TextField = 'name' | 'type' | 'size' | 'color'

// `missing` replaces the shared schema's message; its only rule per field is
// "not empty", so any error on a field means it was left blank.
const FIELDS: { name: TextField; label: string; placeholder: string; missing: string }[] = [
  { name: 'name', label: 'Name', placeholder: 'Zip hoodie', missing: 'Give it a name' },
  { name: 'type', label: 'Type', placeholder: 'Pick one below or type your own', missing: 'Pick a type or type your own' },
  { name: 'size', label: 'Size', placeholder: 'Like M or 32', missing: 'What size is it?' },
  { name: 'color', label: 'Colour', placeholder: 'Like black', missing: 'What colour is it?' },
]

// The Add and Edit form: photo, four fields, the nine type chips and submit.
export function ItemForm({
  title,
  defaultValues,
  currentImageUrl,
  requirePhoto,
  submitLabel,
  onSubmit,
  footer,
}: {
  title: string
  defaultValues: createItem
  currentImageUrl?: string
  requirePhoto: boolean
  submitLabel: string
  onSubmit: (value: createItem, image: File | undefined) => Promise<void>
  footer?: ReactNode
}) {
  // A ref, so the submit handler always sees the latest file.
  const imageRef = useRef<File | undefined>(undefined)
  const [photoMissing, setPhotoMissing] = useState(false)

  const form = useForm({
    validatorAdapter: zodValidator(),
    defaultValues,
    onSubmit: async ({ value }) => {
      if (requirePhoto && !imageRef.current) {
        setPhotoMissing(true)
        return
      }
      await onSubmit(value, imageRef.current)
    },
  })

  return (
    <div className="mx-auto max-w-md px-4 py-8">
      <h1 className="text-4xl font-black">{title}</h1>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          e.stopPropagation()
          if (requirePhoto && !imageRef.current) setPhotoMissing(true)
          form.handleSubmit()
        }}
        className="mt-6 flex flex-col gap-5"
      >
        <div className="flex flex-col gap-1.5">
          <PhotoPicker
            previewUrl={currentImageUrl}
            onChange={(file) => {
              imageRef.current = file
              if (file) setPhotoMissing(false)
            }}
          />
          {photoMissing ? (
            <p role="alert" className="text-sm font-bold text-danger">
              Add a photo first
            </p>
          ) : null}
        </div>

        {FIELDS.map(({ name, label, placeholder, missing }) => (
          <form.Field key={name} name={name} validators={{ onChange: createItemSchema.shape[name] }}>
            {(field) => (
              <div className="flex flex-col gap-3">
                <Field
                  label={label}
                  name={field.name}
                  placeholder={placeholder}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  error={
                    field.state.meta.isTouched && field.state.meta.errors.length
                      ? missing
                      : undefined
                  }
                />
                {name === 'type' ? (
                  <div className="flex flex-wrap gap-2.5 pb-1">
                    {TYPE_LABELS.map((key, i) => (
                      <TypeChip
                        key={key}
                        type={key}
                        index={i}
                        selected={typeKey(field.state.value) === key}
                        onClick={() => {
                          form.setFieldValue('type', TYPE_NAMES[key])
                          void form.validateField('type', 'change')
                        }}
                      >
                        {TYPE_NAMES[key]}
                      </TypeChip>
                    ))}
                  </div>
                ) : null}
              </div>
            )}
          </form.Field>
        ))}

        <form.Subscribe selector={(state) => state.canSubmit}>
          {(canSubmit) => (
            <ChunkyButton type="submit" size="lg" className="mt-2 w-full" disabled={!canSubmit}>
              {submitLabel}
            </ChunkyButton>
          )}
        </form.Subscribe>
      </form>
      {footer ? <div className="mt-8">{footer}</div> : null}
    </div>
  )
}
